/** AIG Robotics: pure deterministic gate. No network, database or robot commands. */
export type RobotState="OFFLINE"|"IDLE"|"TRANSIT"|"DELIVERING"|"CHARGING"|"BLOCKED";
export type TaskState="QUEUED"|"DISPATCHED"|"EN_ROUTE"|"ARRIVED"|"COMPLETED"|"FAILED"|"ESCALATED"|"CANCELLED";
export type Principal=Readonly<{tenantId:string;propertyId:string;actorId:string;permittedRobotIds:readonly string[]}>;
export type Robot=Readonly<{tenantId:string;propertyId:string;robotId:string;state:RobotState;battery:number;lastSeenEpochMs:number}>;
export type Task=Readonly<{tenantId:string;propertyId:string;taskId:string;robotId:string;state:TaskState;retryCount:number;nextRetryEpochMs:number;version:number}>;
export type Decision={ok:true;nextState:TaskState;retryCount:number}|{ok:false;code:string;requiresHuman:boolean};
const NEXT:Record<TaskState,readonly TaskState[]>={
 QUEUED:["DISPATCHED","CANCELLED"],DISPATCHED:["EN_ROUTE","FAILED","CANCELLED"],
 EN_ROUTE:["ARRIVED","FAILED","CANCELLED"],ARRIVED:["COMPLETED","FAILED","CANCELLED"],
 COMPLETED:[],FAILED:["QUEUED","ESCALATED"],ESCALATED:[],CANCELLED:[],
};
export function decideTransition(p:Principal,r:Robot,t:Task,target:TaskState,nowMs:number):Decision{
 if(p.tenantId!==t.tenantId||p.propertyId!==t.propertyId||r.tenantId!==t.tenantId||r.propertyId!==t.propertyId||r.robotId!==t.robotId||!p.permittedRobotIds.includes(r.robotId))
  return {ok:false,code:"NOT_FOUND",requiresHuman:false};
 if(!Number.isFinite(nowMs)||nowMs<0)return {ok:false,code:"INVALID_TIME",requiresHuman:false};
 if(!NEXT[t.state].includes(target))return {ok:false,code:"INVALID_TRANSITION",requiresHuman:false};
 if(target==="DISPATCHED"||(t.state==="FAILED"&&target==="QUEUED")){
  if(r.state==="OFFLINE"||r.state==="BLOCKED")return {ok:false,code:"ROBOT_UNSAFE",requiresHuman:true};
  if(r.state!=="IDLE")return {ok:false,code:"ROBOT_BUSY",requiresHuman:false};
  if(r.battery<25||r.battery>100)return {ok:false,code:"BATTERY_UNSAFE",requiresHuman:true};
  if(r.lastSeenEpochMs>nowMs||nowMs-r.lastSeenEpochMs>30000)return {ok:false,code:"STALE_TELEMETRY",requiresHuman:true};
 }
 if(t.state==="FAILED"&&target==="QUEUED"){
  if(t.retryCount>=2)return {ok:false,code:"RETRY_LIMIT",requiresHuman:true};
  if(nowMs<t.nextRetryEpochMs)return {ok:false,code:"RETRY_BACKOFF",requiresHuman:false};
  return {ok:true,nextState:"QUEUED",retryCount:t.retryCount+1};
 }
 return {ok:true,nextState:target,retryCount:t.retryCount};
}
export type Telemetry=Readonly<{tenantId:string;propertyId:string;robotId:string;seq:number;recordedAtMs:number;battery:number;signalDbm:number;pose?:{frameId:string;xMeters:number;yMeters:number;accuracyMeters:number}}>;
export function validateTelemetry(p:Principal,r:Robot,item:Telemetry,lastSeq:number,nowMs:number):string|null{
 if(p.tenantId!==item.tenantId||p.propertyId!==item.propertyId||r.tenantId!==item.tenantId||r.propertyId!==item.propertyId||r.robotId!==item.robotId||!p.permittedRobotIds.includes(item.robotId))return "NOT_FOUND";
 if(!Number.isSafeInteger(item.seq)||item.seq<=lastSeq)return "REPLAYED_SEQUENCE";
 if(!Number.isFinite(item.recordedAtMs)||item.recordedAtMs>nowMs+5000||nowMs-item.recordedAtMs>60000)return "STALE_TIMESTAMP";
 if(!Number.isInteger(item.battery)||item.battery<0||item.battery>100)return "INVALID_BATTERY";
 if(!Number.isInteger(item.signalDbm)||item.signalDbm< -150||item.signalDbm>0)return "INVALID_SIGNAL";
 if(item.pose){
  const q=item.pose;
  if(!q.frameId||q.frameId.length>80||!Number.isFinite(q.xMeters)||!Number.isFinite(q.yMeters)||!Number.isFinite(q.accuracyMeters)||q.accuracyMeters<=0)return "INVALID_POSE";
 }
 return null;
}
