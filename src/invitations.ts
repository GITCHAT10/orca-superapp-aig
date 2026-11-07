import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "./db.js";
import { hashPassword, tokenDigest } from "./password.js";

const invitationSchema=z.object({
  email:z.email().max(254).transform(value=>value.toLowerCase()),
  role:z.enum(["ADMIN","MEMBER"]),
}).strict();
const acceptanceSchema=z.object({
  tenantSlug:z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
  email:z.email().max(254).transform(value=>value.toLowerCase()),
  inviteToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password:z.string().min(12).max(128),
}).strict();

function onboardingAllowed() {
  // Explicitly non-production: no secure delivery, SSO or MFA is wired yet.
  return process.env.NODE_ENV!=="production" &&
    process.env.OCEAN_INVITATIONS_UAT_ENABLED==="true";
}

export async function registerOceanInvitationRoutes(app:FastifyInstance,pool:Pool) {
  app.post("/v1/tenants/invitations",async(request,reply)=>{
    if(!onboardingAllowed())return reply.code(423).send({error:"Invitation onboarding disabled"});
    const principal=request.oceanPrincipal!;
    if(principal.role!=="OWNER"&&principal.role!=="ADMIN"){
      return reply.code(403).send({error:"Tenant administrator required"});
    }
    const input=invitationSchema.parse(request.body);
    if(principal.role==="ADMIN"&&input.role==="ADMIN"){
      return reply.code(403).send({error:"Only tenant owner may invite administrators"});
    }
    const rawToken=randomBytes(32).toString("base64url");
    return withTenant(pool,principal.tenantId,async client=>{
      // Reject an existing identity until a separately governed multi-tenant
      // account-linking workflow is implemented.
      const existing=await client.query("SELECT 1 FROM ocean_users WHERE email=$1",[input.email]);
      if(existing.rowCount)return reply.code(409).send({error:"Invitation cannot be created"});
      const created=await client.query<{id:string}>(
        "INSERT INTO ocean_invitations(tenant_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING id",
        [principal.tenantId,input.email,input.role,tokenDigest(rawToken),principal.userId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'INVITATION_CREATED',$3)",
        [principal.tenantId,principal.userId,created.rows[0]!.id],
      );
      // UAT only: token is returned just once, never persisted in plaintext.
      return reply.code(201).send({
        invitationId:created.rows[0]!.id,role:input.role,expiresInSeconds:86400,
        inviteToken:rawToken,delivery:"NOT_SENT_UAT_ONLY",
      });
    });
  });

  app.post("/v1/tenants/invitations/accept",async(request,reply)=>{
    if(!onboardingAllowed())return reply.code(423).send({error:"Invitation onboarding disabled"});
    const input=acceptanceSchema.parse(request.body);
    const tenant=await pool.query<{id:string}>(
      "SELECT id FROM ocean_tenants WHERE slug=$1",[input.tenantSlug],
    );
    if(!tenant.rows[0])return reply.code(400).send({error:"Invalid or expired invitation"});
    const tenantId=tenant.rows[0].id;
    const credentials=await hashPassword(input.password);
    return withTenant(pool,tenantId,async client=>{
      // FOR UPDATE prevents simultaneous redemption from creating two members.
      const found=await client.query<{id:string;email:string;role:string}>(
        "SELECT id,email,role FROM ocean_invitations WHERE tenant_id=$1 AND token_hash=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
        [tenantId,tokenDigest(input.inviteToken)],
      );
      const invite=found.rows[0];
      if(!invite || invite.email!==input.email) {
        return reply.code(400).send({error:"Invalid or expired invitation"});
      }
      const existing=await client.query("SELECT 1 FROM ocean_users WHERE email=$1",[input.email]);
      if(existing.rowCount)return reply.code(409).send({error:"Invitation cannot be accepted"});
      const user=await client.query<{id:string}>(
        "INSERT INTO ocean_users(email,password_salt,password_hash) VALUES($1,$2,$3) RETURNING id",
        [input.email,credentials.salt,credentials.hash],
      );
      const userId=user.rows[0]!.id;
      await client.query(
        "INSERT INTO ocean_memberships(tenant_id,user_id,role) VALUES($1,$2,$3)",
        [tenantId,userId,invite.role],
      );
      await client.query(
        "UPDATE ocean_invitations SET accepted_at=now(),accepted_user_id=$1 WHERE id=$2 AND tenant_id=$3",
        [userId,invite.id,tenantId],
      );
      await client.query(
        "INSERT INTO ocean_audit_events(tenant_id,actor_id,action,resource) VALUES($1,$2,'INVITATION_ACCEPTED',$3)",
        [tenantId,userId,invite.id],
      );
      return reply.code(201).send({tenantId,userId,role:invite.role,accepted:true});
    });
  });
}
