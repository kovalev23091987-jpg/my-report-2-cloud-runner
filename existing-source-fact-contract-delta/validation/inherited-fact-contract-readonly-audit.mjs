import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const arr=v=>Array.isArray(v)?v:[];const safe=(v,f=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??f);}catch{return f;}};const rows=x=>Array.isArray(x?.results)?x.results:[];const clean=v=>String(v??'').trim();
async function q(db,sql,binds,label){try{return{status:'CLOSED',rows:rows(await db.prepare(sql).bind(...binds).all()),error:null};}catch(e){return{status:'SOURCE_UNSUPPORTED',rows:[],error:`${label}:${String(e?.message||e).slice(0,240)}`};}}
export async function run({db,runtimeDir='runtime',startTs=Date.now()-14*86400000,endTs=Date.now()}={}){
 const runtime=path.resolve(runtimeDir),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
 const [{normalizeInheritedFact},{buildRuntimeCanonicalBundle}]=await Promise.all([load('inherited-fact-contract.mjs'),load('canonical-runtime-adapter.mjs')]);
 const full=await q(db,`SELECT contract_code,observed_ts,dq_status,evidence_compact_json FROM full_evidence_shadow_log WHERE shadow_only=1 AND observed_ts BETWEEN ?1 AND ?2 ORDER BY observed_ts DESC LIMIT 2048`,[startTs,endTs],'full');
 let originalClosed=0,identityClosed=0,factClosed=0,qualityExplicit=0,timestampsClosed=0,quoteDistinct=true;const failures=[];let canonicalProof=null;
 for(const snap of full.rows){
   const ev=arr(safe(snap.evidence_compact_json,[]));
   for(const raw of ev){
     if(String(raw?.status||'').toUpperCase()!=='CLOSED')continue;originalClosed++;
     const f=normalizeInheritedFact(raw,{default_contract_code:snap.contract_code,default_observed_ts:snap.observed_ts,default_quality_status:snap.dq_status||'UNKNOWN'});
     if(f.identity_status==='CLOSED')identityClosed++;else if(failures.length<12)failures.push({kind:'identity',contract:snap.contract_code,raw,fact:f});
     if(f.fact_contract_status==='CLOSED')factClosed++;else if(failures.length<12)failures.push({kind:'contract',contract:snap.contract_code,raw,fact:f});
     if(clean(f.quality_status))qualityExplicit++;
     if(Number.isFinite(Number(f.event_ts))&&Number.isFinite(Number(f.received_ts)))timestampsClosed++;
     if(f.identity?.quote_asset && !['USD','USDT','USDC','BTC','ETH'].includes(f.identity.quote_asset))quoteDistinct=false;
   }
   if(!canonicalProof){
     const first=ev.find(x=>String(x?.status||'').toUpperCase()==='CLOSED');
     if(first){
       const publicEvidence={contract_code:snap.contract_code,observed_ts:snap.observed_ts,dq_status:snap.dq_status,evidence:[first]};
       const free={status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0};
       const bundle=buildRuntimeCanonicalBundle({contract:snap.contract_code,run_id:`R06980:${snap.observed_ts}`,snapshot_id:`R06980:${snap.observed_ts}`,observed_ts:snap.observed_ts,publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}},public_evidence:publicEvidence,free_source_summary:free});
       const fact=bundle?.canonical?.source_receipts?.[0]||null;
       canonicalProof={status:bundle?.status,source_receipt_fact_contract_status:fact?.fact_contract_status??null,source_receipt_identity_status:fact?.identity_status??null,quality_status:fact?.quality_status??null,manual_ok:bundle?.manual?.ok===true,telegram_ok:bundle?.telegram?.ok===true,fingerprint_equal:bundle?.manual?.analytical_fingerprint===bundle?.telegram?.analytical_fingerprint};
     }
   }
 }
 const r069=originalClosed>0&&identityClosed===originalClosed&&timestampsClosed===originalClosed&&quoteDistinct?'CLOSED_CURRENT_CONSUMER_IDENTITY':'PARTIAL_CURRENT_CONSUMER_IDENTITY';
 const r080=originalClosed>0&&factClosed===originalClosed&&qualityExplicit===originalClosed&&canonicalProof?.source_receipt_fact_contract_status==='CLOSED'&&canonicalProof?.source_receipt_identity_status==='CLOSED'?'CLOSED_CURRENT_FACT_CONTRACT':'PARTIAL_CURRENT_FACT_CONTRACT';
 const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error('FACT_CONTRACT_AUDIT_NOT_READ_ONLY');
 return{version:'inherited-fact-contract-readonly-audit-v1-20260925',status:'CLOSED_READ_ONLY_AUDIT',r069,r080,counts:{snapshots:full.rows.length,original_closed:originalClosed,identity_closed:identityClosed,fact_contract_closed:factClosed,quality_explicit:qualityExplicit,timestamps_closed:timestampsClosed},canonical_proof:canonicalProof,failures,query_status:{full:{status:full.status,rows:full.rows.length,error:full.error}},d1_usage:usage,safety:{production_writes:false,d1_writes:false,telegram_send:false,trading:false,weights_changed:false,thresholds_changed:false,probability_enabled:false,new_sources_added:false}};
}
async function main(){const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});const r=await run({db,runtimeDir:process.env.REPORT2_FACT_CONTRACT_RUNTIME_DIR||'runtime'});fs.writeFileSync(process.env.REPORT2_FACT_CONTRACT_OUTPUT||'inherited-fact-contract-readonly-audit.json',JSON.stringify(r,null,2)+'\n');console.log('INHERITED_FACT_CONTRACT_AUDIT',JSON.stringify({status:r.status,r069:r.r069,r080:r.r080,counts:r.counts,canonical:r.canonical_proof,d1_usage:r.d1_usage}));}
main().catch(e=>{console.error('INHERITED_FACT_CONTRACT_AUDIT_FATAL',String(e?.stack||e));process.exit(1);});
