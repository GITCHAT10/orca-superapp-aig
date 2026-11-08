import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateStagingRoute} from "../src/staging/stagingControlPlane.js";

const tenant="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const request={targetDomain:"ROBOTICS_DISPATCH",tenantId:tenant,propertyId:"demo-property",actionPayload:{taskId:"test-1"}};

test("staging route denies unauthenticated context regardless of request user IDs",()=>{
 assert.deepEqual(evaluateStagingRoute(undefined,{...request,userId:"admin"}).body,{status:"UNAUTHENTICATED",executed:false});
});
test("staging route hides cross-tenant targets",()=>{
 const result=evaluateStagingRoute(tenant,{...request,tenantId:other});
 assert.equal(result.statusCode,404);
 assert.equal(result.body.executed,false);
});
test("rejects unknown domains and unrecognized properties format",()=>{
 assert.equal(evaluateStagingRoute(tenant,{...request,targetDomain:"BRAIN_CORAL"}).statusCode,400);
 assert.equal(evaluateStagingRoute(tenant,{...request,propertyId:""}).statusCode,400);
});
test("finance, robotics and IoT all fail closed until actual adapters and scoped property grants exist",()=>{
 for(const targetDomain of ["FINANCE_CORE","ROBOTICS_DISPATCH","BUILDINGS_IOT"]){
  const result=evaluateStagingRoute(tenant,{...request,targetDomain});
  assert.equal(result.statusCode,503);
  assert.equal(result.body.executed,false);
  assert.equal(result.body.status,"STAGING_ADAPTER_NOT_CONNECTED");
 }
});
test("client-supplied role/session and unsupported fields rejected",()=>{
 assert.equal(evaluateStagingRoute(tenant,{...request,userRole:"OWNER",session:{userId:"admin"}}).statusCode,400);
});
