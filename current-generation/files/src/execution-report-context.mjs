/** Informational use of the immutable, exact canonical snapshot's HTX book.
 * Historical verification is as-of the decision clock, never a live fill or entry grant.
 * Receipts are produced from the final report text, outside canonical fingerprints.
 */
import {verifyExecutionFacts} from './tz101-execution-facts.mjs';
import {digest} from './upstream-proof-utils.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
export const EXECUTION_REPORT_CONTEXT_VERSION='execution-report-context-v2-canonical-20261004';
const stamp=n=>Number.isSafeInteger(n)&&n>=1_000_000_000_000;
const failure=reason=>({status:'NOT_CLOSED',reason,facts:[],entry_authorized:false,score_contribution:0});
const number=n=>String(Number(n.toFixed(6)));
export function consumeExecutionReportContext(row,runId){
 try{
  const c=row?.canonical,s=row?.execution_context_source,b=s?.bundle,g=b?.execution_gate,r=b?.safety_gate_receipt;
  if(typeof runId!=='string'||!runId||row?.run_id!==runId||c?.run_id!==runId||
   typeof row.contract!=='string'||!row.contract.endsWith('-USDT')||s?.contract_code!==row.contract||
   c?.contract!==row.contract||b?.contract_code!==row.contract||g?.contract_code!==row.contract||r?.contract_code!==row.contract||
   row.snapshot_id!==`S392:${row.contract}:${row.observed_ts}`||row.snapshot_id!==c.snapshot_id||row.snapshot_id!==b?.snapshot_id||row.snapshot_id!==g?.snapshot_id||row.snapshot_id!==r?.snapshot_id||
   !stamp(row.observed_ts)||row.observed_ts!==c.observed_ts||row.observed_ts!==s?.observed_ts||row.observed_ts!==b?.observed_ts||row.observed_ts!==r?.observed_ts||
   !stamp(s?.persisted_ts)||s.persisted_ts<s.observed_ts||b?.mode!=='SHADOW_ONLY_NO_EXECUTION'||b?.version!=='stage-3.9.2-shadow-receipts-v1')return failure('EXACT_RUN_SNAPSHOT_BINDING_MISSING');
  const full=b.full_evidence,p=r.persistence;
  if(!s.full_evidence_id||full?.full_evidence_id!==s.full_evidence_id||full?.contract_code!==row.contract||full?.snapshot_id!==row.snapshot_id||full?.observed_ts!==row.observed_ts||
   full?.persistence?.immutable!==true||full?.persistence?.verification_method!=='D1_IMMUTABLE_RECEIPT'||
   r.status!=='CLOSED'||r.authoritative!==true||!r.receipt_id||g.safety_gate_receipt_id!==r.receipt_id||
   p?.immutable!==true||p.verification_method!=='D1_IMMUTABLE_RECEIPT'||p.receipt_id!==r.receipt_id||
   !['PREPARED_UNACKNOWLEDGED','CLOSED'].includes(p.status)||p.content_digest!==r.content_digest||
   digest({hard_veto:b.hard_veto,execution_gate:g})!==r.content_digest)return failure('IMMUTABLE_SAFETY_MATERIAL_MISMATCH');
  const verified=verifyExecutionFacts(g.factual_basis,{contract_code:row.contract,observed_ts:row.observed_ts});
  if(!verified.facts||!verified.plans)return failure(verified.reasons?.[0]||'EXECUTION_SOURCE_NOT_VERIFIED');
  const f=verified.facts,plans=verified.plans;
  if(!f.bids.length||!f.asks.length)return failure('TWO_SIDED_BOOK_MISSING');
  const clock=new Date(f.book_source_ts).toISOString();
  const facts=[];
  const add=(block_id,label,value)=>facts.push({block_id,label,value,source:'HTX_USDT_M_PERPETUAL_STEP0',source_ts:f.book_source_ts,observed_ts:row.observed_ts,
   evidence_ids:[s.full_evidence_id,r.receipt_id],physical_roots:[`${f.depth_channel}:${f.book_source_ts}`],consumer:'RUN_REPORT_CONFIRMED_CONTEXT',
   score_contribution:0,directional_vote:false,hard_gate:false,entry_authorized:false});
  const depth=levels=>levels.reduce((sum,[price,quantity])=>sum+price*quantity*f.contract_size_base,0);
  const bid=depth(f.bids),ask=depth(f.asks),spread=(f.asks[0][0]/f.bids[0][0]-1)*10000;
  if(![bid,ask,spread].every(Number.isFinite))return failure('BOOK_DEPTH_ARITHMETIC_INVALID');
  add('N11','Измеренная глубина стакана',`на снимке ${clock}: bid ${number(bid)} USDT (${f.bids.length} уровней), ask ${number(ask)} USDT (${f.asks.length} уровней), спред ${number(spread)} б.п.; только возвращённый HTX step0, не вся ликвидность рынка`);
  for(const direction of ['LONG','SHORT']){
   const plan=plans[direction];if(!plan.entry||!plan.exit)continue;
   add('N11',`Проверка размера ${direction}`,`ориентир ${number(f.requested_reference_notional_usdt)} USDT: ${plan.measured_contracts} целых контрактов; вход ${plan.entry.filled_contracts}/${plan.measured_contracts}, выход ${plan.exit.filled_contracts}/${plan.measured_contracts} тем же количеством на снимке; не личная позиция и не гарантия будущего исполнения`);
   if(plan.status==='CLOSED'&&Number.isFinite(plan.round_trip_quote_loss_ex_fees_funding))
    add('N16',`Издержки входа и выхода ${direction}`,`${number(plan.round_trip_quote_loss_ex_fees_funding)} USDT для ${plan.measured_contracts} одинаковых контрактов на снимке; вход ${number(plan.entry.filled_notional_usdt)} USDT, выход ${number(plan.exit.filled_notional_usdt)} USDT; комиссии и funding не включены, разрешения входа нет`);
  }
  return {version:EXECUTION_REPORT_CONTEXT_VERSION,status:'IMMUTABLE_SNAPSHOT_FACTS_VERIFIED',reason:null,run_id:runId,contract:row.contract,snapshot_id:row.snapshot_id,observed_ts:row.observed_ts,facts,entry_authorized:false,score_contribution:0};
 }catch{return failure('EXECUTION_CONTEXT_MALFORMED');}
}
export async function loadExecutionReportSource(db,row,runId){
 if(row?.run_id!==runId||row?.canonical?.run_id!==runId||row?.canonical?.snapshot_id!==row?.snapshot_id||row?.canonical?.observed_ts!==row?.observed_ts||!stamp(row?.observed_ts))return null;
 const found=await db.prepare('SELECT full_evidence_id,shadow_id,contract_code,observed_ts,persisted_ts,stage392_proof_bundle_json FROM full_evidence_shadow_log INDEXED BY idx_full_evidence_shadow_contract_ts WHERE contract_code=?1 AND observed_ts=?2 ORDER BY full_evidence_id LIMIT 2').bind(row.contract,row.observed_ts).all();
 const matches=(found?.results||[]).map(s=>{let bundle=null;try{bundle=JSON.parse(s.stage392_proof_bundle_json);}catch{}return {...s,bundle};}).filter(s=>s.bundle?.snapshot_id===row.snapshot_id);
 if(matches.length!==1)return null;
 const s=matches[0],b=s.bundle;
 // Keep the exact raw factual book and its immutable safety material; other chains stay separate.
 return {full_evidence_id:s.full_evidence_id,shadow_id:s.shadow_id,contract_code:s.contract_code,observed_ts:Number(s.observed_ts),persisted_ts:Number(s.persisted_ts),
  bundle:{version:b.version,mode:b.mode,contract_code:b.contract_code,snapshot_id:b.snapshot_id,observed_ts:b.observed_ts,
   full_evidence:{full_evidence_id:b.full_evidence?.full_evidence_id,contract_code:b.full_evidence?.contract_code,snapshot_id:b.full_evidence?.snapshot_id,observed_ts:b.full_evidence?.observed_ts,persistence:b.full_evidence?.persistence},
   execution_gate:b.execution_gate,hard_veto:b.hard_veto,safety_gate_receipt:b.safety_gate_receipt}};
}
// The same immutable source can enter a NEW canonical snapshot. Historical
// canonical rows are never rewritten, and no trading authority is transferred.
export function consumeCanonicalExecutionContext({contract,run_id,snapshot_id,observed_ts,execution_context_source}={}){
 const identity={contract,run_id,snapshot_id,observed_ts};
 const proof=consumeExecutionReportContext({...identity,canonical:identity,execution_context_source},run_id);
 const facts=proof.facts.map(f=>({...f,source:'HTX',unit:'',field:'IMMUTABLE_EXECUTION_SNAPSHOT',
  label:f.label.replace(/LONG/g,'покупки').replace(/SHORT/g,'продажи'),
  value:f.value.replace(/\bbid\b/g,'покупка').replace(/\bask\b/g,'продажа').replace(/HTX step0/g,'возвращённая выборка HTX').replace(/funding/g,'периодические платежи'),
  evidence_id:`${f.evidence_ids.join('|')}|${f.block_id}|${f.label}`,
  physical_root_key:f.physical_roots.join('|'),physical_root_keys:f.physical_roots,
  consumer:'CANONICAL_CONFIRMED_EXECUTION_CONTEXT',advisory_only:true}));
 return {...proof,facts};
}
export function auditExecutionReportRendering(output={}){
 const receipts=[];
 for(const row of output.candidates||[]){
  const proof=consumeExecutionReportContext(row,output.run_id);
  for(const fact of proof.facts){if(typeof output.report_text==='string'&&output.report_text.includes(`- ${fact.label}: ${fact.value}.`))receipts.push({...fact,run_id:output.run_id,contract:row.contract,snapshot_id:row.snapshot_id});}
 }
 return {version:EXECUTION_REPORT_CONTEXT_VERSION,status:receipts.length?'REPORT_TEXT_VERIFIED':'NO_VERIFIED_RENDERED_EXECUTION_CONTEXT',context_receipts:receipts,used_context_block_ids:[...new Set(receipts.map(r=>r.block_id))],entry_authorized:false,score_contribution:0};
}

export function buildCanonicalExecutionEvidence(identity={}){
 const context=consumeCanonicalExecutionContext(identity);
 if(context.status!=='IMMUTABLE_SNAPSHOT_FACTS_VERIFIED')return [];
 const basis=identity.execution_context_source?.bundle?.execution_gate?.factual_basis;
 const f=basis?.facts;
 if(!stamp(f?.received_ts)||f.received_ts>identity.observed_ts||!stamp(f.valid_until_ts)||f.valid_until_ts<identity.observed_ts)return [];
 return ['N11','N16'].flatMap(block=>{
  const facts=context.facts.filter(row=>row.block_id===block);if(!facts.length)return [];
  return [buildEvidenceV2({provider_id:block==='N11'?'PRIMARY_EXECUTION_STRESS':'PRIMARY_EXECUTION_COST',upstream_id:'HTX_IMMUTABLE_EXECUTION_BOOK',asset_id:`htx-futures:${identity.contract}`,htx_contract:identity.contract,block_id:block,metric_family:block==='N11'?'VERIFIED_EXECUTION_SIZE_CONTEXT':'VERIFIED_EXECUTION_COST_CONTEXT',origin_event_id:`${identity.snapshot_id}:${block}`,dependency_group:`HTX_EXECUTION_BOOK:${identity.snapshot_id}`,source_ts:f.book_source_ts,observed_ts:f.received_ts,first_known_ts:f.received_ts,expires_at:f.valid_until_ts,coverage_status:'EXACT_IMMUTABLE_BOOK_ASSESSMENT',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{source_clock_policy:'EXACT_IMMUTABLE_EXECUTION_SNAPSHOT',immutable_evidence_ids:facts[0].evidence_ids,book_physical_roots:facts[0].physical_root_keys,common_upstream_not_independent_vote:true,entry_authorized:false,score_contribution:0}})];
 });
}
