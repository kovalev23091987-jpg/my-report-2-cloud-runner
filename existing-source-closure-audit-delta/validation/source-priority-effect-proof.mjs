import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RemoteD1Database } from '../../runner/report2-d1-adapter.mjs';

export const SOURCE_PRIORITY_EFFECT_PROOF_VERSION='source-priority-effect-proof-v1-20260925';
const clean=v=>String(v??'').trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const safeJson=(v,fallback=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??fallback);}catch{return fallback;}};
const rows=x=>Array.isArray(x?.results)?x.results:[];

async function q(db,sql,binds,label){
  try{return {status:'CLOSED',rows:rows(await db.prepare(sql).bind(...binds).all()),error:null};}
  catch(e){return {status:'SOURCE_UNSUPPORTED',rows:[],error:`${label}:${String(e?.message||e).slice(0,300)}`};}
}
function scanFixture(contract){
  return {timestamp:0,contracts:[{
    contract_code:contract,turnover_24h_usdt:1_000_000,
    symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},
    quality:{market_present:true},instrument_scope:{classification:'CRYPTO_CONFIRMED'},
    freshness:{stale:false,market_age_sec:0},transitions:{'24h':{price_change_pct:0}},
  }]};
}
function publicEvidenceFrom(receipts){return {status:'CLOSED',evidence:(Array.isArray(receipts)?receipts:[]).map(e=>({...e,status:'CLOSED'}))};}
function closedCurrentEvidence(receipts,now){
  return (Array.isArray(receipts)?receipts:[]).filter(e=>{
    const ts=finite(e?.source_ts),max=finite(e?.max_age_sec);
    return e?.status==='CLOSED'&&clean(e?.venue)!=='HTX'&&e?.source_compatible!==false&&ts!==null&&ts<=now+60_000&&(max===null||now-ts<=max*1000);
  });
}
function factualIdentityClosed(contract,row,receipts,now){
  if(clean(row?.contract_code)!==contract)return false;
  const usable=closedCurrentEvidence(receipts,now);
  return usable.length>0&&usable.every(e=>clean(e?.venue)&&clean(e?.metric)&&finite(e?.source_ts)!==null);
}
function effectRow(result,contract){return (result?.shortlist||[]).find(x=>clean(x?.contract)===contract)||null;}

export async function run({db,runtimeDir='runtime',startTs=Date.now()-14*86400000,endTs=Date.now()}={}){
  if(!db)throw new Error('D1_DB_REQUIRED');
  const load=n=>import(pathToFileURL(path.join(path.resolve(runtimeDir),'src',n)).href);
  const [{normalizeEarlyBridgeReceipt,applyEarlyCandidateBridge},{buildRuntimeCanonicalBundle},{buildFreeSourceRuntimeSummary}]=await Promise.all([
    load('early-candidate-bridge.mjs'),load('canonical-runtime-adapter.mjs'),load('source-registry.mjs')
  ]);
  const earlyQ=await q(db,`SELECT e.*,f.observed_ts AS feature_observed_ts,f.long_evidence_domain_count,f.short_evidence_domain_count,f.feature_json,f.evidence_json
    FROM v3_early_candidate_wave e
    LEFT JOIN v3_early_feature_snapshot f
      ON f.contract_code=e.contract_code AND f.ts_bucket=CAST(e.last_seen_ts/300000 AS INTEGER)*300000
    WHERE e.shadow_only=1 AND e.last_seen_ts BETWEEN ?1 AND ?2
    ORDER BY e.last_seen_ts DESC LIMIT 1024`,[startTs,endTs],'early');
  const fullQ=await q(db,`SELECT contract_code,observed_ts,dq_status,conflicts_json,evidence_compact_json
    FROM full_evidence_shadow_log
    WHERE shadow_only=1 AND observed_ts BETWEEN ?1 AND ?2
    ORDER BY observed_ts DESC LIMIT 1024`,[startTs,endTs],'full_evidence');
  if(earlyQ.status!=='CLOSED'||fullQ.status!=='CLOSED')return {version:SOURCE_PRIORITY_EFFECT_PROOF_VERSION,status:'NOT_CLOSED_SOURCE_QUERY',query_status:{early:earlyQ,full:fullQ},production_writes:false};

  const early=[...earlyQ.rows].sort((a,b)=>{
    const ad=['LONG','SHORT'].includes(clean(a?.direction_hint).toUpperCase())?1:0;
    const bd=['LONG','SHORT'].includes(clean(b?.direction_hint).toUpperCase())?1:0;
    return bd-ad-(finite(a?.last_seen_ts)??0)+(finite(b?.last_seen_ts)??0);
  });
  let selected=null;
  for(const e of early){
    const anchor=Math.max(finite(e?.last_seen_ts)??0,finite(e?.feature_observed_ts)??0);
    if(!(anchor>0))continue;
    const receipt=normalizeEarlyBridgeReceipt(e,{now:anchor});
    if(receipt?.priority_eligible!==true)continue;
    const candidates=fullQ.rows.filter(f=>clean(f?.contract_code)===receipt.contract&&(finite(f?.observed_ts)??Infinity)<=anchor&&(finite(f?.observed_ts)??0)>=anchor-30*60_000);
    for(const f of candidates){
      const receipts=safeJson(f?.evidence_compact_json,[]);
      if(!factualIdentityClosed(receipt.contract,f,receipts,anchor))continue;
      const baseArgs={discovery_prefilter:{shortlist:[],contract_telemetry:[],parameters:{max_shortlist:24},counts:{}},scan:scanFixture(receipt.contract),deep_check_queue:{queue:[{contract:receipt.contract}]},early_rows:[e],now:anchor};
      const withoutSource=applyEarlyCandidateBridge({...baseArgs,full_evidence_rows:[]});
      const withSource=applyEarlyCandidateBridge({...baseArgs,full_evidence_rows:[f]});
      const a=effectRow(withoutSource,receipt.contract),b=effectRow(withSource,receipt.contract);
      const as=finite(a?.early_candidate_operational_priority_0_100),bs=finite(b?.early_candidate_operational_priority_0_100);
      if(!a||!b||b?.preselection_cross_venue_confirmed!==true||as===null||bs===null||!(bs>as))continue;
      const used=Array.isArray(b?.preselection_cross_venue_receipts)?b.preselection_cross_venue_receipts:[];
      if(!used.length)continue;
      selected={early:e,full:f,receipt,anchor,withoutSource,withSource,a,b,used,delta:bs-as};
      break;
    }
    if(selected)break;
  }
  if(!selected){
    return {version:SOURCE_PRIORITY_EFFECT_PROOF_VERSION,status:'NOT_CLOSED_NO_FACTUAL_EFFECT_CASE',early_rows:earlyQ.rows.length,full_evidence_rows:fullQ.rows.length,production_writes:false,d1_usage:typeof db.usageSnapshot==='function'?db.usageSnapshot():null};
  }

  const pub=publicEvidenceFrom(selected.used);
  const summary=buildFreeSourceRuntimeSummary({public_evidence:pub,now:selected.anchor});
  const publication={entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}};
  const withCanonical=buildRuntimeCanonicalBundle({contract:selected.receipt.contract,run_id:`R084:${selected.receipt.wave_id}:WITH`,snapshot_id:`R084:${selected.receipt.wave_id}:WITH`,observed_ts:selected.anchor,discovery_row:selected.b,publication_shadow:publication,public_evidence:pub,free_source_summary:summary});
  const withoutSummary=buildFreeSourceRuntimeSummary({public_evidence:{status:'CLOSED',evidence:[]},now:selected.anchor});
  const withoutCanonical=buildRuntimeCanonicalBundle({contract:selected.receipt.contract,run_id:`R084:${selected.receipt.wave_id}:WITHOUT`,snapshot_id:`R084:${selected.receipt.wave_id}:WITHOUT`,observed_ts:selected.anchor,discovery_row:selected.a,publication_shadow:publication,public_evidence:{status:'CLOSED',evidence:[]},free_source_summary:withoutSummary});
  const sourceReason=withCanonical?.canonical?.reasons?.some(r=>r?.label==='Межбиржевое подтверждение')===true;
  const noSourceReason=withoutCanonical?.canonical?.reasons?.some(r=>r?.label==='Межбиржевое подтверждение')===true;
  const manualHas=/Межбиржевое подтверждение/.test(withCanonical?.manual?.text||'');
  const telegramHas=/Межбиржевое подтверждение/.test(withCanonical?.telegram?.message||'');
  const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const result={
    version:SOURCE_PRIORITY_EFFECT_PROOF_VERSION,status:'CLOSED_FACTUAL_SOURCE_PRIORITY_EFFECT',observed_ts:Date.now(),production_writes:false,d1_writes:false,telegram_send:false,trading:false,
    factual_case:{contract:selected.receipt.contract,wave_id:selected.receipt.wave_id,direction_hint:selected.receipt.direction_hint,anchor_ts:selected.anchor,full_evidence_observed_ts:finite(selected.full?.observed_ts),source_receipts:selected.used.map(e=>({venue:e?.venue??null,source:e?.source??null,metric:e?.metric??null,value:e?.value??null,unit:e?.unit??null,status:e?.status??null,source_ts:e?.source_ts??null,max_age_sec:e?.max_age_sec??null,source_compatible:e?.source_compatible!==false})),identity_contract_match:true,freshness_proven:true,no_lookahead:selected.used.every(e=>(finite(e?.source_ts)??Infinity)<=selected.anchor)},
    causal_effect:{without_source_priority:selected.a.early_candidate_operational_priority_0_100,with_source_priority:selected.b.early_candidate_operational_priority_0_100,priority_delta:selected.delta,preselection_status:selected.b.preselection_cross_venue_status,cross_venue_confirmed:selected.b.preselection_cross_venue_confirmed===true,hard_gates_bypassed:selected.withSource?.early_bridge?.hard_gates_bypassed===true,strategy_weights_changed:selected.withSource?.early_bridge?.strategy_weights_changed===true,scheduler_priority_is_probability:selected.b.scheduler_priority_is_probability===true},
    canonical:{with_status:withCanonical?.status,manual_ok:withCanonical?.manual?.ok===true,telegram_ok:withCanonical?.telegram?.ok===true,manual_telegram_fingerprint_equal:withCanonical?.manual?.analytical_fingerprint===withCanonical?.telegram?.analytical_fingerprint,source_reason_present:sourceReason,without_source_reason_present:noSourceReason,manual_has_source_reason:manualHas,telegram_has_source_reason:telegramHas},
    negative_control:{same_candidate_without_source_priority:selected.a.early_candidate_operational_priority_0_100,no_source_confirmation:selected.a.preselection_cross_venue_confirmed===true,no_source_reason_present:noSourceReason},
    query_counts:{early_rows:earlyQ.rows.length,full_evidence_rows:fullQ.rows.length},d1_usage:usage,
  };
  if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error('READ_ONLY_GUARD_FAILED');
  return result;
}

async function main(){
  const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
  const result=await run({db,runtimeDir:process.env.REPORT2_EFFECT_RUNTIME_DIR||'runtime',startTs:Number(process.env.REPORT2_EFFECT_START_TS||Date.now()-14*86400000),endTs:Number(process.env.REPORT2_EFFECT_END_TS||Date.now())});
  fs.writeFileSync(process.env.REPORT2_EFFECT_OUTPUT||'source-priority-effect-proof.json',JSON.stringify(result,null,2)+'\n');
  console.log('SOURCE_PRIORITY_EFFECT_PROOF',JSON.stringify(result));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main().catch(e=>{console.error('SOURCE_PRIORITY_EFFECT_PROOF_FATAL',String(e?.stack||e));process.exit(1);});
