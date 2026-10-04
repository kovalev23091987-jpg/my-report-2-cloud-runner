import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';

export const BLOCK_RESULT_CONTEXT_VERSION='block-result-context-v1-20261004';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const positive=v=>number(v)!==null&&v>=0;
const fmt=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v);
const eq=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;
const list=v=>Array.isArray(v)?v:[];
const common={advisory_only:true,directional_vote:false,hard_gate:false,score_contribution:0};
function describe(row,now){
 if(row.block_id==='N05'&&row.metric_family==='CEX_NET_FLOW_TWO_COMPLETE_HOURS'){
  const start=number(row.window_start_ts),end=number(row.window_end_ts),incoming=number(row.incoming_tokens),outgoing=number(row.outgoing_tokens);
  if(start===null||end===null||end-start!==7200000||end>now||row.source_ts!==end||!positive(incoming)||!positive(outgoing)||row.unit!=='TOKEN_AMOUNT'||!eq(incoming-outgoing,row.value))return null;
  return{source:'Nansen',label:'Потоки токена через биржи за два полных часа',value:`поступило ${fmt(incoming)}, выведено ${fmt(outgoing)}; чистый ${incoming>=outgoing?'приток':'отток'} ${fmt(Math.abs(incoming-outgoing))} токенов; охват источника ${fmt(row.coverage_fraction*100)} из 100`};
 }
 if(row.block_id==='N12'&&row.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE'){
  const buy=number(row.buy_quote_turnover_usdt),sell=number(row.sell_quote_turnover_usdt),count=number(row.valid_recent_rows);
  if(!positive(buy)||!positive(sell)||!Number.isSafeInteger(count)||count<1||row.unit!=='USDT'||!eq(buy+sell,row.value))return null;
  return{source:'HTX',label:'Направление последних сделок HTX',value:`выборка ${count} сделок: покупки ${fmt(buy)}, продажи ${fmt(sell)} USDT; ограниченная выборка, не суточный поток`};
 }
 if(['N08','N09'].includes(row.block_id)&&['HTX_OPENING_RESTRICTED','HTX_MARGIN_RISK_CONTEXT'].includes(row.metric_family)){
  if(typeof row.execution_open_allowed!=='boolean'||row.execution_open_scope!=='HTX_ISOLATED_MARGIN'||row.source_clock_closed!==true)return null;
  return{source:'HTX',label:'Разрешение открытия по правилам HTX',value:`изолированная маржа: ${row.execution_open_allowed?'открытие разрешено':'открытие запрещено'}; направление сделки этим не подтверждается`};
 }
 if(['N02','N03'].includes(row.block_id)&&['SUPPLY_INCREASE','SUPPLY_DECREASE'].includes(row.metric_family)){
  if(!/^\d+$/.test(String(row.total_supply_base_units))||!/^\d+$/.test(String(row.previous_supply_base_units))||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255)return null;
  const current=BigInt(row.total_supply_base_units),previous=BigInt(row.previous_supply_base_units),delta=current-previous;
  if(!delta||String(delta)!==row.supply_delta_base_units||(row.metric_family==='SUPPLY_INCREASE')!==(delta>0n))return null;
  // Preserve exact units; arbitrary transfers are never called mint/burn.
  return{source:'публичный RPC',label:'Изменение предложения токена',value:`${delta>0n?'увеличение':'уменьшение'} на ${String(delta<0n?-delta:delta)} минимальных единиц между двумя наблюдениями; точность токена ${row.decimals} знаков; причина изменения не подтверждена`};
 }
 if(row.block_id==='N07'&&row.metric_family==='OFFICIAL_ANNOUNCEMENT'){
  const title=String(row.event_title||'').trim();let url;
  try{url=new URL(row.official_url);}catch{return null;}
  if(!title||url.protocol!=='https:')return null;
  return{source:url.hostname,label:'Официальное объявление проекта',value:`${title.slice(0,240)}; ${new Date(row.source_ts).toISOString().slice(0,10)}; оценка направления не назначена`};
 }
 return null;
}

// This consumer only uses already acquired, exact, validated facts. It neither
// creates a missing score nor interprets raw transfers or social counts as trades.
export function consumeBlockResultContext({evidence=[],contract,now}={}){
 const facts=[],seen=new Set();
 if(!/^[^\s-]+-USDT$/.test(String(contract))||number(now)===null)return{status:'NOT_CLOSED',facts,internal_only:true};
 for(const row of list(evidence)){
  if(row?.htx_contract!==contract||!validateEvidenceV2(row,{decision_ts:now}).usable||number(row.observed_ts)===null||row.source_ts>row.observed_ts||row.observed_ts>now)continue;
  const fact=describe(row,now),root=evidenceDedupKey(row);
  if(!fact||seen.has(root))continue;
  seen.add(root);facts.push({...common,...fact,unit:'',field:row.metric_family,block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:root,source_ts:row.source_ts,observed_ts:row.observed_ts});
 }
 return{version:BLOCK_RESULT_CONTEXT_VERSION,status:facts.length?'CLOSED':'NOT_CLOSED',facts,internal_only:true};
}

// Proof is based on the final formatter output, including its six-fact limit.
// A label in metadata or a completed HTTP call cannot establish actual use.
export function auditRenderedBlockResults({canonical,manual}={}){
 const contract=canonical?.metadata?.contract,now=canonical?.observed_ts;
 const available=consumeBlockResultContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract,now});
 const printed=manual?.ok===true&&typeof manual.text==='string'?manual.text:null;
 const facts=list(canonical?.metadata?.supporting_context?.facts);
 const receipts=available.facts.filter(row=>facts.some(f=>f.evidence_id===row.evidence_id&&f.physical_root_key===row.physical_root_key)&&printed?.includes(`- ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,source_ts:row.source_ts,consumer:'MANUAL_CONFIRMED_CONTEXT',score_contribution:0}));
 return{version:BLOCK_RESULT_CONTEXT_VERSION,contract,run_id:canonical?.run_id??null,snapshot_id:canonical?.snapshot_id??null,status:printed?'RENDERED_OUTPUT_VERIFIED':'FORMATTER_OUTPUT_NOT_CONFIRMED',context_receipts:receipts,used_context_block_ids:[...new Set(receipts.map(row=>row.block_id))],available_not_rendered_evidence_ids:available.facts.filter(row=>!receipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),entry_authorized:false,internal_only:true};
}
