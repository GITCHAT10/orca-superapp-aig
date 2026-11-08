import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

/**
 * Process-shared, PostgreSQL-backed defense against authentication floods.
 * Never trust X-Forwarded-For with trustProxy:false; the edge proxy must also
 * enforce its own request quotas. Neither IPs nor emails are persisted here.
 */
type Policy = Readonly<{ name: string; identityLimit: number; sourceLimit: number }>;
const POLICIES: Readonly<Record<string,Policy>> = {
  "/v1/auth/login": { name: "LOGIN", identityLimit: 15, sourceLimit: 90 },
  "/v1/tenants/register": { name: "SIGNUP", identityLimit: 6, sourceLimit: 30 },
  "/v1/tenants/invitations/accept": { name: "INVITE_ACCEPT", identityLimit: 12, sourceLimit: 60 },
  "/v1/tenants/invitations": { name: "INVITE_CREATE", identityLimit: 20, sourceLimit: 45 },
  "/v1/auth/mfa/enroll": { name: "MFA_ENROLL", identityLimit: 8, sourceLimit: 45 },
  "/v1/auth/mfa/confirm": { name: "MFA_CONFIRM", identityLimit: 12, sourceLimit: 45 },
};
const WINDOW_SECONDS = 60;

function hmacKey(): Buffer {
  const hex = process.env.OCEAN_RATE_LIMIT_KEY_HEX ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Rate-limit secret must be configured");
  }
  return Buffer.from(hex, "hex");
}
function digest(key:Buffer, content:string):string {
  return createHmac("sha256",key).update(content).digest("hex");
}
function bounded(value:unknown, max=254):string {
  return typeof value === "string" ? value.toLowerCase().slice(0,max) : "-";
}
function identityFor(request:FastifyRequest, policy:Policy):string {
  const body=request.body && typeof request.body==="object" && !Array.isArray(request.body)
    ? request.body as Record<string,unknown> : {};
  switch(policy.name) {
    case "LOGIN":
      return bounded(body.tenantSlug,63)+":"+bounded(body.email);
    case "SIGNUP":
      return bounded(body.slug,63)+":"+bounded(body.email);
    case "INVITE_ACCEPT":
      return bounded(body.tenantSlug,63)+":"+bounded(body.email);
    default:
      return request.oceanPrincipal
        ? request.oceanPrincipal.tenantId+":"+request.oceanPrincipal.userId
        : "UNAUTHENTICATED";
  }
}
async function consumeCounter(pool:Pool, keyDigest:string, maximum:number):
  Promise<{allowed:boolean;retryAfter:number}> {
  const result=await pool.query<{attempts:number;retry_after:number}>(`
    INSERT INTO ocean_request_limits(key_digest,attempts,window_started_at,expires_at)
    VALUES($1,1,now(),now()+interval '60 seconds')
    ON CONFLICT(key_digest) DO UPDATE SET
      attempts=CASE WHEN ocean_request_limits.expires_at<=now() THEN 1
                    ELSE ocean_request_limits.attempts+1 END,
      window_started_at=CASE WHEN ocean_request_limits.expires_at<=now() THEN now()
                            ELSE ocean_request_limits.window_started_at END,
      expires_at=CASE WHEN ocean_request_limits.expires_at<=now()
                      THEN now()+interval '60 seconds' ELSE ocean_request_limits.expires_at END,
      updated_at=now()
    RETURNING attempts,
      greatest(1,ceil(extract(epoch from (expires_at-now()))))::int AS retry_after
  `,[keyDigest]);
  const counter=result.rows[0];
  if (!counter) throw new Error("Request limit counter was not persisted");
  return {allowed:counter.attempts<=maximum,retryAfter:counter.retry_after};
}
export function registerAuthThrottle(app:FastifyInstance,pool:Pool):void {
  app.addHook("preValidation",async (request,reply) => {
    if (request.method!=="POST") return;
    const path=request.url.split("?")[0]??"";
    const policy=POLICIES[path];
    if (!policy) return;
    try {
      const secret=hmacKey();
      // trustProxy is false at Fastify construction; ignore forged forward headers.
      const sourceDigest=digest(secret,"SOURCE:"+policy.name+":"+request.ip);
      const source=await consumeCounter(pool,sourceDigest,policy.sourceLimit);
      if (!source.allowed) {
        return reply.code(429).header("Retry-After",String(source.retryAfter))
          .send({error:"Too many authentication requests"});
      }
      const identityDigest=digest(secret,
        "ACCOUNT:"+policy.name+":"+identityFor(request,policy));
      const identity=await consumeCounter(pool,identityDigest,policy.identityLimit);
      if (!identity.allowed) {
        return reply.code(429).header("Retry-After",String(identity.retryAfter))
          .send({error:"Too many authentication requests"});
      }
    } catch {
      // Never fail open if the shared throttle store or HMAC secret is absent.
      return reply.code(503).send({error:"Authentication request protection unavailable"});
    }
  });
}
export const AUTH_RATE_WINDOW_SECONDS=WINDOW_SECONDS;
