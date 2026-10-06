import {createHash} from 'node:crypto';
export const SUPPLEMENTAL_SUPPORTING_BRIDGE_VERSION='supplemental-supporting-bridge-v1-20261006';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const closed=v=>v?.status==='CLOSED';
const clean=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:[];
const positive=v=>number(v)!==null&&number(v)>0;
// This bridge only consumes the collector's already validated exact context.
// It performs no HTTP, identity discovery, strategy vote or N-block assignment.
export function bindSupplementalSupportingReceipts({context=null,existing={},contract,run_id,snapshot_id,decision_ts}={}){
 const receipts={...existing,dex:[...arr(existing?.dex)]},bindings=[];
 const reject=reason=>({version:SUPPLEMENTAL_SUPPORTING_BRIDGE_VERSION,status:'NOT_CLOSED',reason,receipts,bindings,network_calls:0});
 const now=number(decision_ts),id=context?.asset_identity;
 if(!clean(contract)||!clean(run_id)||!clean(snapshot_id)||now===null||context?.contract!==contract||context?.internal_only!==true||context?.registry_status!=='CLOSED')return reject('EXACT_CONTEXT_BINDING_REQUIRED');
 const exactToken=context?.identity_status==='CLOSED'&&!context?.registry_confirmation_required&&context?.asset_identity_candidate==null&&id?.chain&&id?.contract_or_mint;
 const sources=context?.sources||{};
 const usable=(key,ttl)=>{
  const s=sources[key],ts=number(s?.observed_ts);
  return closed(s)&&s.source===key&&s.exact_identity===true&&s.context_version===context.version&&ts!==null&&ts>0&&ts<=now&&now-ts<=ttl?s:null;
 };
 const binding=(source,s,metric,extra={})=>{
  const body={contract,run_id,snapshot_id,decision_ts:now,source,observed_ts:s.observed_ts,metric,identity:metric==='DEX_POOL_LIQUIDITY'?id:null,...extra};
  return {...body,receipt_id:hash(body),assigned_consumer:metric==='DEX_POOL_LIQUIDITY'?'DEX_CONTEXT':'BITGET_CONTEXT',advisory_only:true,score_contribution:0,directional_vote:false,entry_authorized:false};
 };
 if(exactToken){
  const byPool=new Map();
  for(const provider of ['DEX_SCREENER','GECKOTERMINAL']){
   const s=usable(provider,3600000);if(!s)continue;
   const seen=new Set();
   for(const p of arr(s.pools)){
    const key=clean(p?.pool_key);
    if(!key.startsWith(id.chain+'|')||key.length<=id.chain.length+1||seen.has(key)||!positive(p.liquidity_usd))continue;
    seen.add(key);const rows=byPool.get(key)||[];
    rows.push({provider,pool_key:key,liquidity_usd:number(p.liquidity_usd),observed_ts:s.observed_ts,volume_24h_usd:number(p.volume_24h_usd),source:s});byPool.set(key,rows);
   }
  }
  const chosen=[...byPool.entries()].sort((a,b)=>Math.max(...b[1].map(x=>x.liquidity_usd))-Math.max(...a[1].map(x=>x.liquidity_usd))).slice(0,2);
  for(const [pool_key,rows] of chosen){
   if(receipts.dex.some(r=>closed(r)&&r.pool_key===pool_key))continue;
   // Preserve each supplier's value. The existing consumer selects one
   // observed value; overlapping volume and liquidity are never summed.
   for(const r of rows)receipts.dex.push({status:'CLOSED',provider:r.provider,pool_key,liquidity_usd:r.liquidity_usd,observed_ts:r.observed_ts});
   const first=rows.reduce((a,b)=>a.observed_ts>b.observed_ts?a:b);
   bindings.push(binding(first.provider,first.source,'DEX_POOL_LIQUIDITY',{pool_key,provider_observations:rows.map(({source,...r})=>r),independent_confirmation_count:1,overlapping_provider_amounts_not_summed:true}));
  }
 }
 const b=usable('BITGET',300000),symbol=clean(contract).replace(/-/g,'').toUpperCase();
 if(b&&b.symbol===symbol&&!closed(existing?.bitget)&&number(b.funding_rate)!==null){
  // OI is intentionally omitted: normalized responses did not carry a
  // confirmed native unit. Never convert an unknown unit to contracts/zero.
  receipts.bitget={status:'CLOSED',symbol,funding_rate:number(b.funding_rate),observed_ts:b.observed_ts};
  bindings.push(binding('BITGET',b,'FUNDING_RATE',{symbol,unknown_open_interest_unit_omitted:true}));
 }
 return {version:SUPPLEMENTAL_SUPPORTING_BRIDGE_VERSION,status:bindings.length?'CLOSED':'NOT_CLOSED',reason:bindings.length?null:'NO_NEW_EXACT_USABLE_SUPPORTING_FACT',receipts,bindings,network_calls:0};
}
export function attachSupplementalSupportingUse({consumed,bridge}={}){
 const facts=arr(consumed?.facts),bound=[];
 for(const f of facts){
  const b=arr(bridge?.bindings).find(x=>x.assigned_consumer===f.decision_block&&(x.assigned_consumer!=='DEX_CONTEXT'||x.pool_key===f.pool_key));
  if(!b)continue;
  const n={...f,supplemental_supporting_receipt:b,observed_ts:b.observed_ts,first_known_ts:b.observed_ts,contract:b.contract,run_id:b.run_id,snapshot_id:b.snapshot_id,score_contribution:0,entry_authorized:false};
  if(b.assigned_consumer==='DEX_CONTEXT'){
   n.provider_observations=b.provider_observations;n.independent_confirmation_count=1;
   n.provider_observation_count=b.provider_observations.length;n.overlapping_provider_amounts_not_summed=true;
  }
  Object.assign(f,n);bound.push(f);
 }
 return {version:SUPPLEMENTAL_SUPPORTING_BRIDGE_VERSION,status:bound.length?'CLOSED':'NOT_CLOSED',facts:bound,bindings:arr(bridge?.bindings),network_calls:0,core_block_participation_added:0};
}
