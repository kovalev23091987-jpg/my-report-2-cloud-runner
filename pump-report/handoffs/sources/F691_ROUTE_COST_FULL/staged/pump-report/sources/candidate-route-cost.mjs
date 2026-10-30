const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const identity=i=>JSON.stringify([i.instrument_id,i.asset_id,i.native_symbol,i.venue,i.market_type,i.quote,i.settle,i.classification_status,i.identity_evidence_ref]);
const empty=e=>e?.instrument?.classification_status==='VERIFIED_CRYPTO'&&e.instrument.venue==='BINGX'&&e.instrument.market_type==='PERPETUAL'&&e.instrument.quote==='USDT'&&e.instrument.settle==='USDT'&&!['BTC','ETH'].includes(e.instrument.base)&&typeof e.instrument.identity_evidence_ref==='string'&&e.instrument.identity_evidence_ref.length>0&&e.liquidations&&Object.hasOwn(e.liquidations,'routes')&&Array.isArray(e.liquidations.routes)&&e.liquidations.routes.length===0;
export function createCandidateRouteCostQuotes({resolve_entry,binding}){
 const owned=new WeakMap(),instance_id=crypto.randomUUID();
 const enabled=typeof resolve_entry==='function'&&digest(binding?.implementation_sha256)&&digest(binding?.registry_sha256)&&binding?.cost_contract==='BINGX10_TG1_MAP1_ALLOC12_V1';
 const root=enabled?freeze({implementation_sha256:binding.implementation_sha256,registry_sha256:binding.registry_sha256,cost_contract:binding.cost_contract}):null;
 function issue({instrument,run_id}={}){
  if(!root||typeof run_id!=='string'||!run_id||run_id.length>128)return null;
  let e;try{e=resolve_entry(instrument);}catch{return null;}
  if(!empty(e)||identity(e.instrument)!==identity(instrument))return null;
  Object.freeze(e.liquidations.routes);Object.freeze(e.liquidations);Object.defineProperty(e,'liquidations',{writable:false,configurable:false});Object.freeze(e.instrument);
  const target=freeze(structuredClone(e.instrument));
  const proof=freeze({schema:'SOURCE_EMPTY_ROUTE_COST_QUOTE_V1',instance_id,run_id,instrument_id:target.instrument_id,asset_id:target.asset_id,identity_evidence_ref:target.identity_evidence_ref,...root,entry_binding:identity(target),allocation_http_upper_bound:12,operation_http_upper_bound:11,http_by_provider:{BINGX:10,TELEGRAM:1},unassigned_map_http_upper_bound:0,basis:'EXPLICIT_FROZEN_EMPTY_ROUTE_ARRAY',coverage_status:'NOT_CHECKED',unsupported_claimed:false});
  const token=Object.freeze({});owned.set(token,{target,proof,grant_id:null});return token;
 }
 function verify(token,ctx={}){
  const r=token&&owned.get(token);if(!r||ctx.run_id!==r.proof.run_id||ctx.candidate_id!==r.target.instrument_id||ctx.implementation_sha256!==root.implementation_sha256||ctx.registry_sha256!==root.registry_sha256||r.grant_id!==null&&r.grant_id!==ctx.grant_id)return null;
  let e;try{e=resolve_entry(r.target);}catch{return null;}
  return empty(e)&&identity(e.instrument)===r.proof.entry_binding?r.proof:null;
 }
 function commit(token,ctx={}){
  const proof=verify(token,ctx),r=token&&owned.get(token);
  if(!proof||ctx.grant_id!==proof.run_id+'|'+proof.instrument_id)return false;
  if(r.grant_id!==null&&r.grant_id!==ctx.grant_id)return false;
  r.grant_id=ctx.grant_id;return true;
 }
 return Object.freeze({issue,verify,commit});
}
