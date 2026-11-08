import type {FastifyInstance} from "fastify";
import {z} from "zod";

/**
 * Deliberately non-executing staging contract. No financial posting, IoT issuance,
 * physical dispatch, network calls, or false-positive simulated success is possible.
 * Existing ORCA bearer-session onRequest authentication must run first.
 */
export const stagingRequest = z.object({
  targetDomain:z.enum(["FINANCE_CORE","ROBOTICS_DISPATCH","BUILDINGS_IOT"]),
  tenantId:z.uuid(),
  propertyId:z.string().min(1).max(80),
  actionPayload:z.record(z.string(),z.unknown()).optional(),
}).strict();

export function evaluateStagingRoute(
  authenticatedTenantId:string|undefined,
  payload:unknown
):{statusCode:number;body:{status:string;executed:false;error?:string;domain?:string}}{
  if(!authenticatedTenantId)return {statusCode:401,body:{status:"UNAUTHENTICATED",executed:false}};
  const parsed=stagingRequest.safeParse(payload);
  if(!parsed.success)return {statusCode:400,body:{status:"INVALID_STAGING_REQUEST",executed:false}};
  if(parsed.data.tenantId!==authenticatedTenantId)
    return {statusCode:404,body:{status:"NOT_FOUND",executed:false}};
  return {statusCode:503,body:{
    status:"STAGING_ADAPTER_NOT_CONNECTED",executed:false,
    domain:parsed.data.targetDomain,
    error:"No approved property grant, verified finance adapter, device identity or side-effect execution configured",
  }};
}

export function registerStagingControlPlaneRoutes(app:FastifyInstance):void{
  app.post("/v1/staging/control-plane/validate",async (request,reply)=>{
    const decision=evaluateStagingRoute(request.oceanPrincipal?.tenantId,request.body);
    return reply.code(decision.statusCode).send(decision.body);
  });
}
