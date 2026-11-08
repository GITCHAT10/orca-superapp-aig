import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.js";
import { verifyPassword } from "./password.js";
import {
  newMfaSecret, sealMfaSecret, unsealMfaSecret,
  findTotpStep, provisioningUri,
} from "./mfa.js";

const enrollSchema=z.object({password:z.string().min(1).max(128)}).strict();
const confirmSchema=z.object({otp:z.string().regex(/^\d{6}$/)}).strict();

function enrollmentEnabled():boolean {
  return process.env.NODE_ENV!=="production" &&
    process.env.OCEAN_MFA_UAT_ENABLED==="true";
}
type PendingMfa={
  enabled:boolean;
  pending_ciphertext:Buffer|null;
  pending_nonce:Buffer|null;
  pending_tag:Buffer|null;
  valid:boolean;
};
export async function registerMfaRoutes(app:FastifyInstance,pool:Pool) {
  app.get("/v1/auth/mfa",async request=>{
    const principal=request.oceanPrincipal!;
    return withTenant(pool,principal.tenantId,async client=>{
      const state=await client.query<{enabled:boolean}>(
        "SELECT enabled FROM ocean_mfa_credentials WHERE tenant_id=$1 AND user_id=$2",
        [principal.tenantId,principal.userId],
      );
      return {enabled:state.rows[0]?.enabled===true,method:"TOTP",enrollmentAvailable:enrollmentEnabled()};
    });
  });

  app.post("/v1/auth/mfa/enroll",async(request,reply)=>{
    if(!enrollmentEnabled())return reply.code(423).send({error:"TOTP enrollment disabled"});
    const principal=request.oceanPrincipal!, body=enrollSchema.parse(request.body);
    const user=await pool.query<{email:string;password_salt:string;password_hash:string}>(
      "SELECT email,password_salt,password_hash FROM ocean_users WHERE id=$1",
      [principal.userId],
    );
    if(!user.rows[0] || !(await verifyPassword(body.password,user.rows[0].password_salt,user.rows[0].password_hash))){
      return reply.code(401).send({error:"Password reauthentication required"});
    }
    const secret=newMfaSecret();
    const sealed=sealMfaSecret(secret,principal.tenantId,principal.userId);
    return withTenant(pool,principal.tenantId,async client=>{
      const current=await client.query<{enabled:boolean}>(
        "SELECT enabled FROM ocean_mfa_credentials WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE",
        [principal.tenantId,principal.userId],
      );
      if(current.rows[0]?.enabled)return reply.code(409).send({error:"TOTP already enabled"});
      await client.query(
        `INSERT INTO ocean_mfa_credentials
          (tenant_id,user_id,pending_ciphertext,pending_nonce,pending_tag,pending_expires_at)
         VALUES ($1,$2,$3,$4,$5,now()+interval '10 minutes')
         ON CONFLICT(tenant_id,user_id) DO UPDATE SET
          pending_ciphertext=EXCLUDED.pending_ciphertext,
          pending_nonce=EXCLUDED.pending_nonce,
          pending_tag=EXCLUDED.pending_tag,
          pending_expires_at=EXCLUDED.pending_expires_at,
          updated_at=now()`,
        [principal.tenantId,principal.userId,sealed.ciphertext,sealed.nonce,sealed.tag],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'TOTP_ENROLLMENT_STARTED','SELF')",
        [principal.tenantId,principal.userId],
      );
      // Returned ONLY once, to an authenticated, password-reverified UAT client.
      return reply.code(201).send({
        provisioningUri:provisioningUri(secret,user.rows[0].email),
        pendingForSeconds:600, enabled:false,delivery:"DIRECT_UAT_ONLY",
      });
    });
  });

  app.post("/v1/auth/mfa/confirm",async(request,reply)=>{
    if(!enrollmentEnabled())return reply.code(423).send({error:"TOTP enrollment disabled"});
    const principal=request.oceanPrincipal!, {otp}=confirmSchema.parse(request.body);
    return withTenant(pool,principal.tenantId,async client=>{
      const record=await client.query<PendingMfa>(
        `SELECT enabled,pending_ciphertext,pending_nonce,pending_tag,
           (pending_expires_at>now()) AS valid FROM ocean_mfa_credentials
         WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE`,
        [principal.tenantId,principal.userId],
      );
      const pending=record.rows[0];
      if(!pending||pending.enabled||!pending.valid||!pending.pending_ciphertext||!pending.pending_nonce||!pending.pending_tag){
        return reply.code(409).send({error:"No valid pending enrollment"});
      }
      const secret=unsealMfaSecret({
        ciphertext:pending.pending_ciphertext,nonce:pending.pending_nonce,tag:pending.pending_tag,
      },principal.tenantId,principal.userId);
      const step=findTotpStep(secret,otp,-1);
      if(step===null)return reply.code(401).send({error:"Invalid verification code"});
      await client.query(
        `UPDATE ocean_mfa_credentials SET
          enabled=true,
          secret_ciphertext=pending_ciphertext,
          secret_nonce=pending_nonce,secret_tag=pending_tag,
          pending_ciphertext=NULL,pending_nonce=NULL,pending_tag=NULL,pending_expires_at=NULL,
          last_used_step=$1,updated_at=now()
         WHERE tenant_id=$2 AND user_id=$3`,
        [step,principal.tenantId,principal.userId],
      );
      // Require all older sessions to sign in again with TOTP.
      await client.query(
        "UPDATE ocean_sessions SET revoked_at=now() WHERE tenant_id=$1 AND user_id=$2 AND id<>$3 AND revoked_at IS NULL",
        [principal.tenantId,principal.userId,principal.sessionId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'TOTP_ENABLED','SELF')",
        [principal.tenantId,principal.userId],
      );
      return {enabled:true,method:"TOTP",priorSessionsRevoked:true};
    });
  });
}
