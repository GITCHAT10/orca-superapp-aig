import assert from "node:assert/strict";
import {test} from "node:test";
import {decideTransition,validateTelemetry,type Principal,type Robot,type Task,type Telemetry} from "../src/robotics/roboticsPolicy.js";
const p:Principal={tenantId:"A",propertyId:"SALA",actorId:"operator",permittedRobotIds:["R1"]};
const r:Robot={tenantId:"A",propertyId:"SALA",robotId:"R1",state:"IDLE",battery:80,lastSeenEpochMs:98000};
const t:Task={tenantId:"A",propertyId:"SALA",taskId:"T1",robotId:"R1",state:"QUEUED",retryCount:0,nextRetryEpochMs:0,version:1};
const telemetry:Telemetry={tenantId:"A",propertyId:"SALA",robotId:"R1",seq:5,recordedAtMs:99000,battery:80,signalDbm:-60,pose:{frameId:"floor-1",xMeters:1.2,yMeters:2,accuracyMeters:0.3}};
test("fresh scoped idle robot passes simulation gate",()=>assert.deepEqual(decideTransition(p,r,t,"DISPATCHED",100000),{ok:true,nextState:"DISPATCHED",retryCount:0}));
test("cross property blocked",()=>assert.equal(decideTransition({...p,propertyId:"AVM"},r,t,"DISPATCHED",100000).ok,false));
test("offline/blocked/charging/stale/low battery denied",()=>{
 for(const state of ["OFFLINE","BLOCKED","CHARGING"] as const)assert.equal(decideTransition(p,{...r,state},t,"DISPATCHED",100000).ok,false);
 assert.equal(decideTransition(p,{...r,lastSeenEpochMs:50000},t,"DISPATCHED",100000).ok,false);
 assert.equal(decideTransition(p,{...r,battery:10},t,"DISPATCHED",100000).ok,false);
});
test("retry limit and backoff enforced",()=>{
 const failed={...t,state:"FAILED" as const,retryCount:1,nextRetryEpochMs:110000};
 assert.equal(decideTransition(p,r,failed,"QUEUED",100000).ok,false);
 assert.deepEqual(decideTransition(p,r,failed,"QUEUED",110000),{ok:true,nextState:"QUEUED",retryCount:2});
 assert.deepEqual(decideTransition(p,r,{...failed,retryCount:2},"QUEUED",110000),{ok:false,code:"RETRY_LIMIT",requiresHuman:true});
});
test("completed task cannot be retried",()=>assert.equal(decideTransition(p,r,{...t,state:"COMPLETED"},"QUEUED",100000).ok,false));
test("telemetry rejects replay, spoofing and invalid pose",()=>{
 assert.equal(validateTelemetry(p,r,telemetry,4,100000),null);
 assert.equal(validateTelemetry(p,r,telemetry,5,100000),"REPLAYED_SEQUENCE");
 assert.equal(validateTelemetry(p,r,{...telemetry,propertyId:"OTHER"},4,100000),"NOT_FOUND");
 assert.equal(validateTelemetry(p,r,{...telemetry,pose:{...telemetry.pose!,accuracyMeters:0}},4,100000),"INVALID_POSE");
});
