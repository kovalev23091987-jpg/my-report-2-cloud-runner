export const STATE_CONTRACT_VERSION='state-contract-v1-20260925';

export const SOURCE_DEPLOYMENT_STAGES=Object.freeze(['PRODUCTION','CANDIDATE','SHADOW','NOT_CONFIGURED','UNSUPPORTED','BLOCKED']);
export const SOURCE_RUNTIME_STATES=Object.freeze(['AVAILABLE','MISSING','STALE','RATE_LIMITED','TIMEOUT','UNSUPPORTED','NOT_CONFIGURED','BLOCKED','BUDGET_EXHAUSTED','NOT_APPLICABLE','SOURCE_EXHAUSTED','DIVERGENCE','UNKNOWN']);
export const DECISION_STATES=Object.freeze(['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED','WAIT_FOR_TRIGGER','OBSERVE','REJECTED']);

const clean=v=>String(v??'').trim().toUpperCase();
const BAD_HEALTH=new Set(['DOWN','ERROR','RATE_LIMITED','TIMEOUT','UNHEALTHY','BLOCKED']);

export function sourceRuntimeState(row={}){
  const explicit=clean(row.runtime_state||row.availability_state||row.status);
  if(['BLOCKED','UNSUPPORTED','NOT_CONFIGURED','BUDGET_EXHAUSTED','NOT_APPLICABLE','RATE_LIMITED','TIMEOUT','STALE','MISSING'].includes(explicit))return explicit;
  if(row.blocked===true)return 'BLOCKED';
  if(row.configured===false)return 'NOT_CONFIGURED';
  if(row.supported===false)return 'UNSUPPORTED';
  if(row.rate_limited===true)return 'RATE_LIMITED';
  if(row.timeout===true)return 'TIMEOUT';
  const health=clean(row.health??row.source_health);
  if(health==='RATE_LIMITED')return 'RATE_LIMITED';
  if(health==='TIMEOUT')return 'TIMEOUT';
  if(BAD_HEALTH.has(health))return health==='BLOCKED'?'BLOCKED':'MISSING';
  if(row.fresh===false)return 'STALE';
  return 'UNKNOWN';
}

export function sourceAvailabilityProof(row={}, {freshness_proven=false,connected=false,healthy=false,compatible=true}={}){
  const runtime=sourceRuntimeState(row);
  if(['BLOCKED','UNSUPPORTED','NOT_CONFIGURED','BUDGET_EXHAUSTED','NOT_APPLICABLE','RATE_LIMITED','TIMEOUT','STALE','MISSING'].includes(runtime)){
    return {available:false,state:runtime,reason:`SOURCE_${runtime}`};
  }
  if(!connected)return {available:false,state:'MISSING',reason:'SOURCE_RUNTIME_RECEIPT_MISSING'};
  if(!freshness_proven)return {available:false,state:'STALE',reason:'SOURCE_FRESHNESS_NOT_PROVEN'};
  if(!healthy)return {available:false,state:'MISSING',reason:'SOURCE_HEALTH_NOT_CLOSED'};
  if(!compatible)return {available:false,state:'MISSING',reason:'SOURCE_INCOMPATIBLE'};
  return {available:true,state:'AVAILABLE',reason:null};
}

export function validDecisionState(value){return DECISION_STATES.includes(clean(value));}
