import {readEarlyMarketSnapshots} from './market-history-reader.mjs';
import {
  parseStage0CompactPayload,
  buildEarlyObservation,
  advanceEarlyCandidateMemory,
} from './v3-early-discovery.mjs';
import {
  decodeEarlyCandidateRow,
  persistEarlyCandidateShadow,
  V3_EARLY_MAX_PERSIST_CANDIDATES_PER_CYCLE,
} from './v3-early-persistence-runtime.mjs';
import { loadMicrostructureForContracts, featureInputsFromMicrostructureRows } from './v3-market-microstructure-persistence.mjs';

export const V3_EARLY_SIDECAR_VERSION = 'v3-early-sidecar-shadow-v1';
export const V3_EARLY_NEW_WAVE_PAUSE_MS = 6*60*60_000;
export const V3_EARLY_SIDECAR_BUDGET = Object.freeze({
  rows_read: 4096,
  rows_written: 32,
  requests_soft_cap: 20,
  recent_scan_rows: 80,
  active_candidate_rows: 12,
  microstructure_rows: 192,
  max_enrichment_contracts: 8,
  max_persist_candidates: V3_EARLY_MAX_PERSIST_CANDIDATES_PER_CYCLE,
});

const TERMINAL = new Set(['EXIT','EDGE_SPENT','EXCLUDE']);
function finite(v){ if(v==null||v==='') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function text(v){ return v==null?'':String(v).trim(); }
function resultRows(result){ return Array.isArray(result?.results)?result.results:[]; }
function usageDelta(before,after){
  if(!before||!after) return null;
  return {
    rows_read:Math.max(0,Number(after.rows_read||0)-Number(before.rows_read||0)),
    rows_written:Math.max(0,Number(after.rows_written||0)-Number(before.rows_written||0)),
    requests:Math.max(0,Number(after.requests||0)-Number(before.requests||0)),
    unknown_ops:Math.max(0,Number(after.unknown_ops||0)-Number(before.unknown_ops||0)),
  };
}

export function shouldOpenNewWave({prior,observation_ts}={}){
  const last=finite(prior?.last_seen_ts),current=finite(observation_ts);
  if(!prior||last===null||current===null||current<=last)return false;
  return current-last>V3_EARLY_NEW_WAVE_PAUSE_MS;
}

function decodeSnapshotRow(row){
  return parseStage0CompactPayload(row?.payload_json ?? null, row?.ts ?? null);
}
function priorDiscoveryRank(row){
  const pd=row?.prior_discovery||{};
  const triggers=Math.max(Number(pd.long_trigger_count||0),Number(pd.short_trigger_count||0));
  const watch=pd.long_watch===true||pd.short_watch===true;
  return {watch,triggers};
}
function domainCount(obs){ return Math.max(Number(obs?.long_evidence_domain_count||0),Number(obs?.short_evidence_domain_count||0)); }
function rankTuple(item){
  const legacy=priorDiscoveryRank(item.current_row);
  return [
    domainCount(item.observation),
    legacy.watch?1:0,
    legacy.triggers,
    Number(item.observation?.early_detection_quality_0_100||0),
    -Number(item.current_row?.market_age_sec??999999),
  ];
}
function compareRank(a,b){
  const aa=rankTuple(a),bb=rankTuple(b);
  for(let i=0;i<aa.length;i+=1){ if(aa[i]!==bb[i]) return bb[i]-aa[i]; }
  return String(a.contract).localeCompare(String(b.contract));
}
function stage0FeatureInputs(snapshots,contract,baseObservation,microInputs={}){
  const rows=[];
  for(const snap of Array.isArray(snapshots)?snapshots:[]){const r=snap?.rows?.get?.(contract);if(!r||r.data_status!=='CLOSED')continue;rows.push(r);}
  const price_series=rows.map(r=>({ts:r.ts,price:r.price,open:null,high:null,low:null,close:r.price}));
  const oi_series=rows.map(r=>({ts:r.ts,oi:r.oi_contracts}));
  const funding_series=rows.map(r=>({ts:r.ts,venue:'HTX',rate:r.funding_rate,interval_hours:r.funding_interval_hours}));
  const relative=baseObservation?.relative_strength||{};
  const relative_strength={...relative,coverage_closed:[relative.btc_1h_pct_points,relative.eth_1h_pct_points,relative.btc_4h_pct_points,relative.eth_4h_pct_points].some(Number.isFinite)};
  return{price_series,oi_series,funding_series,relative_strength,...microInputs};
}
function preliminaryEnrichmentContracts(observations,activeCandidates){
  const active=new Set((Array.isArray(activeCandidates)?activeCandidates:[]).map(x=>text(x?.contract_code)).filter(Boolean));
  return observations.slice().sort(compareRank).sort((a,b)=>(active.has(b.contract)?1:0)-(active.has(a.contract)?1:0)).slice(0,V3_EARLY_SIDECAR_BUDGET.max_enrichment_contracts).map(x=>x.contract);
}

export function chooseEarlyPersistenceTargets({observations=[],active_candidates=[],preferred_contracts=[]}={}){
  const active=new Map((Array.isArray(active_candidates)?active_candidates:[])
    .map(decodeEarlyCandidateRow).filter(Boolean).map(c=>[text(c.contract_code),c]));
  const items=[];
  for(const raw of Array.isArray(observations)?observations:[]){
    const contract=text(raw?.contract); if(!contract) continue;
    const prior=active.get(contract)||null;
    // A completed Deep Check may request the existing slot, but never reopen
    // a terminal wave or bypass the ordinary observation eligibility checks.
    if(prior && TERMINAL.has(text(prior.lifecycle_stage))) continue;
    const observation=raw?.observation;
    if(!observation||observation.status!=='CLOSED') continue;
    const legacy=priorDiscoveryRank(raw?.current_row);
    const newEligible=domainCount(observation)>=2 || legacy.watch;
    if(!prior && !newEligible) continue;
    items.push({contract,observation,current_row:raw.current_row,prior,new_eligible:newEligible});
  }
  const picked=[]; const seen=new Set();
  const take=(x)=>{ if(!x||seen.has(x.contract)||picked.length>=V3_EARLY_MAX_PERSIST_CANDIDATES_PER_CYCLE) return; seen.add(x.contract); picked.push(x); };
  for(const contract of preferred_contracts.slice(0,6)) take(items.find(x=>x.contract===contract));
  // Age breaks ties; it cannot consume the only slot ahead of better evidence.
  const ranked=items.slice().sort((a,b)=>compareRank(a,b)||Number(a.prior?.last_seen_ts||0)-Number(b.prior?.last_seen_ts||0));
  for(const x of ranked) take(x);
  return picked;
}

async function loadEarlyInputs(db,{current_scan_ts,now_ts,preferred_contracts=[]}={}){
  const currentTs=finite(current_scan_ts)??finite(now_ts)??Date.now();
  const recentStart=currentTs-6*60*60_000;
  const nearest=(target,tol)=>db.prepare(`SELECT ts,payload_json FROM scan_runs
    WHERE ts_bucket BETWEEN ?1 AND ?2 AND stage0_coverage_pct>=99.9 AND errors=0 AND stale=0
    ORDER BY ABS(ts-?3) ASC LIMIT 1`).bind(target-tol,target+tol,target);
  const statements=[
    db.prepare(`SELECT ts,payload_json FROM scan_runs
      WHERE ts_bucket BETWEEN ?1 AND ?2 AND stage0_coverage_pct>=99.9 AND errors=0 AND stale=0
      ORDER BY ts DESC LIMIT ${V3_EARLY_SIDECAR_BUDGET.recent_scan_rows}`).bind(recentStart,currentTs),
    nearest(currentTs-12*60*60_000,20*60_000),
    nearest(currentTs-24*60*60_000,30*60_000),
    db.prepare(`SELECT * FROM v3_early_candidate_wave
      WHERE shadow_only=1 AND lifecycle_stage NOT IN ('EXIT','EDGE_SPENT','EXCLUDE')
      ORDER BY last_seen_ts ASC LIMIT ${V3_EARLY_SIDECAR_BUDGET.active_candidate_rows}`),
  ];
  // Point lookups retain first-seen/generation even when the handoff candidate
  // falls outside the oldest twelve active rows. No fabricated wave identity.
  const preferred=[...new Set(preferred_contracts)].slice(0,6);
  for(const contract of preferred) statements.push(db.prepare(`SELECT * FROM v3_early_candidate_wave
    WHERE contract_code=?1 ORDER BY last_seen_ts DESC LIMIT 1`).bind(contract));
  const result=await db.batch(statements);
  const recent=resultRows(result?.[0]);
  const baseline12=resultRows(result?.[1]);
  const baseline24=resultRows(result?.[2]);
  const activeMap=new Map(resultRows(result?.[3]).map(r=>[r.contract_code,r]));
  for(const response of result.slice(4)) for(const row of resultRows(response)) activeMap.set(row.contract_code,row);
  const active=[...activeMap.values()];
  const uniq=new Map();
  for(const row of [...recent,...baseline12,...baseline24]){
    const ts=finite(row?.ts); if(ts===null) continue;
    const parsed=decodeSnapshotRow(row); if(parsed.status==='CLOSED') uniq.set(ts,parsed);
  }
  const collected=await readEarlyMarketSnapshots({db,now_ts:currentTs});
  // Five-minute collector data supplies the sequence; compact scans retain the
  // current exact scan and long baselines, with factual original timestamps.
  if(collected.snapshots.length){
    for(const [ts] of uniq)if(ts>=recentStart&&ts!==currentTs)uniq.delete(ts);
    for(const snapshot of collected.snapshots)if(snapshot.ts<currentTs)uniq.set(snapshot.ts,snapshot);
  }
  const snapshots=[...uniq.values()].sort((a,b)=>a.ts-b.ts);
  return {status:'CLOSED',currentTs,snapshots,active_candidates:active,read_rows:recent.length+baseline12.length+baseline24.length+active.length};
}

export async function runV3EarlyPersistenceSidecar(db,{current_scan_ts,source_run_id=null,now_ts=Date.now(),preferred_contracts=[],selected_only=false,cycle_context=null}={}){
  const base={version:V3_EARLY_SIDECAR_VERSION,mode:'SHADOW_ONLY',source_run_id:text(source_run_id)||null,probability:null,validated_signal:false,trading_execution:false};
  if(!db?.prepare||!db?.batch) return {...base,status:'SOURCE_UNSUPPORTED',persisted:0};
  const before=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const cache=cycle_context&&typeof cycle_context==='object'?cycle_context:null;
  const key=`${source_run_id}|${current_scan_ts}`;
  if(cache&&cache.key!==key){cache.key=key;cache.loaded=null;cache.observations=null;cache.attempted=new Set();}
  let loaded;
  try{
    loaded=cache?.loaded||await loadEarlyInputs(db,{current_scan_ts,now_ts,preferred_contracts});
    if(cache)cache.loaded=loaded;
    if(selected_only)for(const contract of preferred_contracts.slice(0,1)){
      const prior=await db.prepare('SELECT * FROM v3_early_candidate_wave WHERE contract_code=?1 ORDER BY generation DESC,last_seen_ts DESC LIMIT 1').bind(contract).first();
      if(prior)loaded.active_candidates=[...loaded.active_candidates.filter(r=>r.contract_code!==contract),prior];
    }
  }
  catch(error){
    const msg=String(error?.message||error);
    return {...base,status:/no such table/i.test(msg)?'MIGRATION_REQUIRED':'INPUT_LOAD_PARTIAL',persisted:0,error:msg};
  }
  const current=loaded.snapshots.filter(s=>s.ts<=loaded.currentTs).at(-1)||null;
  if(!current) return {...base,status:'CURRENT_SNAPSHOT_NOT_CLOSED',persisted:0};
  let observations=cache?.observations||[];
  if(!cache?.observations)for(const [contract,row] of current.rows.entries()){
    if(contract==='BTC-USDT'||contract==='ETH-USDT') continue;
    const observation=buildEarlyObservation({contract,snapshots:loaded.snapshots,now_ts:loaded.currentTs});
    if(observation.status==='CLOSED') observations.push({contract,current_row:row,observation});
  }
  const enrichContracts=preliminaryEnrichmentContracts(observations,loaded.active_candidates);
  let micro={status:'CLOSED_NO_CONTRACTS',rows:[]};
  if(!cache?.observations&&enrichContracts.length){micro=await loadMicrostructureForContracts(db,enrichContracts,{end_ts:loaded.currentTs,lookback_ms:60*60_000,max_rows:V3_EARLY_SIDECAR_BUDGET.microstructure_rows});}
  if(!cache?.observations){ // Price/OI/funding features do not depend on optional microstructure rows.
    const baseBy=new Map(observations.map(x=>[x.contract,x]));
    for(const contract of baseBy.keys()){const base=baseBy.get(contract);if(!base)continue;const feature_inputs=stage0FeatureInputs(loaded.snapshots,contract,base.observation,featureInputsFromMicrostructureRows(micro.status==='CLOSED'?micro.rows:[],{contract}));const enriched=buildEarlyObservation({contract,snapshots:loaded.snapshots,now_ts:loaded.currentTs,feature_inputs});if(enriched.status==='CLOSED')base.observation=enriched;}
    observations=[...baseBy.values()];
  }
  if(cache)cache.observations=observations;
  const eligibleObservations=selected_only?observations.filter(r=>preferred_contracts.slice(0,1).includes(r.contract)):observations;
  const targets=chooseEarlyPersistenceTargets({observations:eligibleObservations,active_candidates:loaded.active_candidates,preferred_contracts});
  const persisted=[];
  for(const target of targets){
    if(cache?.attempted.has(target.contract)){persisted.push({contract:target.contract,status:'CLOSED',reused:true});continue;}
    if(cache&&cache.attempted.size>=2)return {...base,status:'CYCLE_EARLY_WRITE_LIMIT',persisted:0};
    if(cache)cache.attempted.add(target.contract);
    // The oldest-active sample is not proof that another coin has no wave.
    const exactPrior=await db.prepare('SELECT * FROM v3_early_candidate_wave WHERE contract_code=?1 ORDER BY generation DESC,last_seen_ts DESC LIMIT 1').bind(target.contract).first();
    const prior=exactPrior?decodeEarlyCandidateRow(exactPrior):target.prior;
    if(prior&&TERMINAL.has(text(prior.lifecycle_stage))){persisted.push({contract:target.contract,status:'TERMINAL_WAVE_NOT_REOPENED'});continue;}
    // A materially separated recurrence is a new market wave. Its new wave_id
    // makes the existing per-wave duplicate key sendable while same-wave
    // repeats remain suppressed.
    const newWave=shouldOpenNewWave({prior,observation_ts:loaded.currentTs});
    const memory=advanceEarlyCandidateMemory({prior,observation:target.observation,new_wave:newWave});
    if(memory.status!=='CLOSED') { persisted.push({contract:target.contract,status:memory.status}); continue; }
    const write=await persistEarlyCandidateShadow(db,{observation:target.observation,candidate:memory.candidate,new_wave_opened:memory.new_wave_opened});
    persisted.push({contract:target.contract,status:write.status,new_wave_opened:memory.new_wave_opened,wave_id:memory.candidate.wave_id,lifecycle_stage:memory.candidate.lifecycle_stage,direction_hint:memory.candidate.direction_hint,statements:write.statements});
  }
  const after=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const delta=usageDelta(before,after);
  if(delta && (delta.rows_read>V3_EARLY_SIDECAR_BUDGET.rows_read||delta.rows_written>V3_EARLY_SIDECAR_BUDGET.rows_written||delta.unknown_ops>0)){
    return {...base,status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',persisted:persisted.length,usage_delta:delta,targets:persisted};
  }
  const partial=persisted.some(x=>x.status!=='CLOSED');
  return {
    ...base,
    status:partial?'PARTIAL':(persisted.length?'CLOSED':'CLOSED_NO_EARLY_CANDIDATE'),
    snapshot_count:loaded.snapshots.length,
    contracts_observed:observations.length,
    active_candidates_loaded:loaded.active_candidates.length,
    microstructure_status:micro.status,
    microstructure_rows_loaded:Array.isArray(micro.rows)?micro.rows.length:0,
    microstructure_enrichment_contracts:enrichContracts.length,
    selected_count:targets.length,
    persisted:persisted.filter(x=>x.status==='CLOSED'&&!x.reused).length,
    reused:persisted.filter(x=>x.reused).length,
    usage_delta:delta,
    targets:persisted,
  };
}

export default {V3_EARLY_SIDECAR_VERSION,V3_EARLY_NEW_WAVE_PAUSE_MS,V3_EARLY_SIDECAR_BUDGET,shouldOpenNewWave,chooseEarlyPersistenceTargets,runV3EarlyPersistenceSidecar};
