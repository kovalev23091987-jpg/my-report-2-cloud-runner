import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';

export const BLOCK_RESULT_CONTEXT_VERSION='block-result-context-v2-approved-telegram-parity-20261004';
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const positive=v=>number(v)!==null&&v>=0;
const fmt=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v);
const eq=(a,b)=>Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*1e-9;
const list=v=>Array.isArray(v)?v:[];
const common={advisory_only:true,directional_vote:false,hard_gate:false,score_contribution:0};
const raw=v=>typeof v==='string'&&/^\d+$/.test(v);
function tokenAmount(value,decimals){
 const n=BigInt(value),base=10n**BigInt(decimals),fraction=String(n%base).padStart(decimals,'0').replace(/0+$/,'');
 return new Intl.NumberFormat('ru-RU').format(n/base)+(fraction?`,${fraction}`:'');
}
function describe(row,now){
 if(row.block_id==='N14'&&row.metric_family==='ALT_OPTIONS_CATALOG_ABSENCE'){
  if(row.source_clock_policy!=='OBSERVED_STATIC_CATALOG_QUERY'||row.base_currency!==row.htx_contract.replace(/-USDT$/,'')||row.open_instrument_count!==0||row.value!==0||!/^[0-9a-f]{64}$/i.test(row.catalog_response_sha256||''))return null;
  return{source:'Deribit',label:'Доступность опционов актива',value:`в каталоге Deribit на ${new Date(row.source_ts).toISOString().replace('T',' ').slice(0,19)} UTC открытых опционов актива не найдено; сведения относятся только к этой площадке, опционный риск не оценён`};
 }
 if(row.block_id==='N14'&&row.metric_family==='ALT_OPTIONS_LIQUIDITY_CONTEXT'){
  const open=number(row.open_instrument_count),liquid=number(row.liquid_instrument_count);
  if(row.source_clock_policy!=='PROVIDER_TIMESTAMP_ONLY'||row.base_currency!==row.htx_contract.replace(/-USDT$/,'')||!Number.isSafeInteger(open)||open<1||!Number.isSafeInteger(liquid)||liquid<0||liquid>open)return null;
  return{source:'Deribit',label:'Опционный рынок актива',value:`открытых инструментов ${open}, с котировками или активностью в проверенной выборке ${liquid}; это не оценка опционного риска и не разрешение сделки`};
 }
 if(row.block_id==='N02'&&row.metric_family==='SUPPLY_UNCHANGED'){
  if(!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||BigInt(row.total_supply_base_units)!==BigInt(row.previous_supply_base_units)||row.supply_delta_base_units!=='0')return null;
  return{source:'публичный RPC',label:'Наблюдение предложения токена',value:`${tokenAmount(row.total_supply_base_units,row.decimals)} токенов; между двумя наблюдениями изменения нет; будущие разблокировки этим не проверены`};
 }
 if(row.block_id==='N06'&&row.metric_family==='UNIQUE_AUTHOR_ATTENTION'){
  const start=number(row.window_start),end=number(row.window_end),authors=number(row.value),posts=number(row.original_post_count);
  if(row.query_identity!=='EXACT_CONTRACT_OR_MINT'||row.unit!=='unique_authors'||start===null||end===null||end<=start||end>now||row.source_ts!==end||!Number.isSafeInteger(authors)||authors<0||!Number.isSafeInteger(posts)||posts<authors||typeof row.sample_saturated!=='boolean')return null;
  return{source:'Bluesky',label:'Публичные сообщения с точным адресом токена',value:`за ${fmt((end-start)/60000)} минут: ${authors} авторов, ${posts} сообщений${row.sample_saturated?'; выборка ограничена лимитом':''}; поиск только по адресу, общий интерес и тренд этим не подтверждены`};
 }
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
 // Group event logs by transaction. Serial transfers are never summed as flow.
 const groups=new Map();
 for(const row of list(evidence)){
  if(row?.block_id!=='N04'||row.metric_family!=='TOKEN_TRANSFER'||row.htx_contract!==contract||!validateEvidenceV2(row,{decision_ts:now}).usable||number(row.observed_ts)===null||row.source_ts>row.observed_ts||row.observed_ts>now||!raw(row.amount_base_units)||!/^0x[0-9a-f]{64}$/i.test(row.tx_hash||'')||!/^0x[0-9a-f]{40}$/i.test(row.from||'')||!/^0x[0-9a-f]{40}$/i.test(row.to||'')||!/^\d+$/.test(String(row.log_index))||!row.chain||!row.token_address||row.event_is_not_market_direction!==true)continue;
  const root=evidenceDedupKey(row);if(seen.has(root))continue;seen.add(root);
  const key=`${row.asset_id}|${row.chain}|${row.token_address}|${row.tx_hash}`;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 for(const rows of groups.values()){
  const row=rows[0],amounts=[...new Set(rows.map(r=>r.amount_base_units))];
  const supply=list(evidence).find(r=>r.block_id==='N02'&&r.asset_id===row.asset_id&&r.chain===row.chain&&r.token_address===row.token_address&&r.htx_contract===contract&&validateEvidenceV2(r,{decision_ts:now}).usable&&number(r.observed_ts)!==null&&r.observed_ts<=now&&r.source_ts<=r.observed_ts&&Number.isSafeInteger(r.decimals)&&r.decimals>=0&&r.decimals<=255);
  const quantity=amounts.length===1?(supply?`${tokenAmount(amounts[0],supply.decimals)} токенов в каждом событии`:`${amounts[0]} минимальных единиц в каждом событии`):'разные количества';
  facts.push({...common,source:'публичный RPC',label:'Подтверждённые переводы токена',value:`${rows.length} событий в одной транзакции; ${quantity}; ограниченная выборка, события не суммируются как приток или отток; принадлежность адресов биржам не подтверждена`,unit:'',field:'TOKEN_TRANSFER',block_id:'N04',evidence_id:row.evidence_id,physical_root_key:evidenceDedupKey(row),evidence_ids:rows.map(r=>r.evidence_id),physical_root_keys:rows.map(evidenceDedupKey),source_ts:Math.max(...rows.map(r=>r.source_ts)),observed_ts:Math.max(...rows.map(r=>r.observed_ts))});
 }
 return{version:BLOCK_RESULT_CONTEXT_VERSION,status:facts.length?'CLOSED':'NOT_CLOSED',facts,internal_only:true};
}

// A stored descriptive fact cannot substitute for its exact still-valid evidence.
// Both presentation surfaces use the same source/use binding, without scores.
export function confirmedBlockContextFacts(canonical){
 const available=consumeBlockResultContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract:canonical?.metadata?.contract,now:canonical?.observed_ts});
 const stored=list(canonical?.metadata?.supporting_context?.facts);
 return available.facts.filter(row=>stored.some(f=>f.evidence_id===row.evidence_id&&f.physical_root_key===row.physical_root_key&&f.label===row.label&&f.value===row.value));
}

// Proof is based on the final formatter output, including its bounded fact limit.
// A label in metadata or a completed HTTP call cannot establish actual use.
export function auditRenderedBlockResults({canonical,manual,telegram}={}){
 const contract=canonical?.metadata?.contract,now=canonical?.observed_ts;
 const available=consumeBlockResultContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract,now});
 const printed=manual?.ok===true&&typeof manual.text==='string'?manual.text:null;
 const receipts=confirmedBlockContextFacts(canonical).filter(row=>printed?.includes(`- ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,evidence_ids:row.evidence_ids||[row.evidence_id],physical_root_keys:row.physical_root_keys||[row.physical_root_key],source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,source:row.source,consumer:'MANUAL_CONFIRMED_CONTEXT',score_contribution:0}));
 const payload=telegram?.ok===true&&typeof telegram.text==='string'&&Boolean(canonical?.analytical_fingerprint)&&telegram.analytical_fingerprint===canonical.analytical_fingerprint?telegram.text:null;
 const telegramReceipts=confirmedBlockContextFacts(canonical).filter(row=>payload?.includes(`• ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,consumer:'APPROVED_TELEGRAM_PAYLOAD_CONTEXT',score_contribution:0}));
 return{version:BLOCK_RESULT_CONTEXT_VERSION,contract,run_id:canonical?.run_id??null,snapshot_id:canonical?.snapshot_id??null,status:printed?'RENDERED_OUTPUT_VERIFIED':'FORMATTER_OUTPUT_NOT_CONFIRMED',context_receipts:receipts,used_context_block_ids:[...new Set(receipts.map(row=>row.block_id))],available_not_rendered_evidence_ids:available.facts.filter(row=>!receipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_payload_status:payload?'APPROVED_PAYLOAD_TEXT_OBSERVED':'APPROVED_PAYLOAD_NOT_CONFIRMED',telegram_context_receipts:telegramReceipts,telegram_used_context_block_ids:[...new Set(telegramReceipts.map(row=>row.block_id))],telegram_available_not_rendered_evidence_ids:available.facts.filter(row=>!telegramReceipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_delivery_proven:false,telegram_message_id:null,entry_authorized:false,internal_only:true};
}
