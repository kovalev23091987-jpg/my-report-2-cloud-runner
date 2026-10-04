import {validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {consumeCanonicalExecutionContext} from './execution-report-context.mjs';

export const BLOCK_RESULT_CONTEXT_VERSION='block-result-context-v4-immutable-execution-parity-20261004';
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
 if(row.block_id==='N01'&&row.metric_family==='OFFICIAL_VESTING_TERMS'){
  if(row.source_clock_policy!=='OBSERVED_PRIMARY_DOCUMENT_QUERY'||row.actual_unlock_transfer_verified!==false||!/^[0-9a-f]{64}$/.test(row.document_sha256||''))return null;
  if(row.parser_id==='NEAR_PUBLISHED_UNLOCK_STATUS_V1'&&row.asset_id==='near:native:mainnet'&&row.htx_contract==='NEAR-USDT'&&row.official_url==='https://www.near.org/'&&row.published_status==='FULLY_UNLOCKED')return{source:'near.org',label:'Опубликованный статус блокировок NEAR',value:'официальный сайт сообщает о полностью разблокированном предложении; инфляция и новая эмиссия этим не исключены; это заявление проекта, а не проверка будущих транзакций'};
  if(row.parser_id==='APTOS_PUBLISHED_TERMS_V1'&&row.asset_id==='aptos:native:mainnet'&&row.htx_contract==='APT-USDT'&&row.official_url==='https://aptosnetwork.com/currents/aptos-tokenomics-overview'&&row.mainnet_date==='2022-10-12'&&row.private_lockup_months===48&&row.community_foundation_monthly_fraction==='1/120'&&row.staking_rewards_excluded===true&&row.terms_are_projected===true)return{source:'aptosnetwork.com',label:'Опубликованные условия распределения APT',value:'документ от 17.10.2022: команда и инвесторы — блокировка на 48 месяцев от запуска 12.10.2022, без наград стейкинга; оставшаяся доля сообщества и фонда — по 1/120 в месяц; фактические переводы и действующие изменения условий этим не подтверждены'};
  return null;
 }
 if(['N02','N03'].includes(row.block_id)&&['SUPPLY_INCREASE','SUPPLY_DECREASE'].includes(row.metric_family)){
  if(!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||row.comparison_policy!=='EXACT_ASSET_DECIMALS_DISTINCT_BLOCK_INCREASING_CLOCK'||!Number.isSafeInteger(row.previous_source_ts)||row.previous_source_ts>=row.source_ts||!row.previous_block_ref||row.previous_block_ref===row.block_ref)return null;
  const delta=BigInt(row.total_supply_base_units)-BigInt(row.previous_supply_base_units);
  if(String(delta)!==row.supply_delta_base_units||delta===0n||row.metric_family!==(delta<0n?'SUPPLY_DECREASE':'SUPPLY_INCREASE')||row.block_id!==(delta<0n?'N03':'N02'))return null;
  return{source:'публичный RPC',label:delta<0n?'Уменьшение предложения между наблюдениями':'Увеличение предложения между наблюдениями',value:`изменение на ${delta<0n?'−':'+'}${tokenAmount(String(delta<0n?-delta:delta),row.decimals)} токенов в двух финализированных состояниях; причина изменения, выкуп и влияние на цену этим не установлены`};
 }
 if(row.block_id==='N03'&&row.metric_family==='BURN_TRANSFER'){
  if(row.producer!=='FINALIZED_ERC20_EVENTS'||row.to!=='0x'+'0'.repeat(40)||row.from===row.to||!/^0x[0-9a-f]{40}$/i.test(row.from||'')||!/^0x[0-9a-f]{64}$/i.test(row.tx_hash||'')||!raw(row.amount_base_units)||BigInt(row.amount_base_units)<=0n||row.event_is_not_market_direction!==true)return null;
  return{source:'публичный RPC',label:'Перевод токена на нулевой адрес',value:`${row.amount_base_units} минимальных единиц в финализированной транзакции ${row.tx_hash}; уменьшение totalSupply, выкуп и влияние на цену этим не подтверждены`};
 }
 if(row.block_id==='N03'&&row.metric_family==='TOKEN_BALANCE_DECREASE'){
  if(row.producer!=='SOLANA_FINALIZED_TOKEN_BALANCE_DIFF'||row.chain!=='solana'||!raw(row.amount_base_units)||BigInt(row.amount_base_units)<=0n||row.event_is_not_market_direction!==true)return null;
  return{source:'Solana mainnet RPC',label:'Снижение баланса токена в проверенной транзакции',value:`${row.amount_base_units} минимальных единиц; это изменение суммы наблюдённых балансов, сжигание и выкуп не подтверждены`};
 }
 if(row.block_id==='N08'&&row.metric_family==='HTX_OPENING_RESTRICTION_CHECK'){
  if(row.execution_open_scope!=='HTX_ISOLATED_MARGIN'||row.margin_account!==row.htx_contract||row.execution_open_allowed!==true||row.source_clock_closed!==true||row.execution_open_raw!==1)return null;
  return{source:'HTX',label:'Проверка ограничения открытия',value:'по точному контракту с изолированной маржой поле open=1: ограничения открытия в этом ответе HTX нет; кросс-маржа этим не проверена'};
 }
 if(row.block_id==='N07'&&row.metric_family==='OFFICIAL_FEED_BOUNDED_ABSENCE'){
  if(row.source_clock_policy!=='OBSERVED_OFFICIAL_FEED_QUERY'||row.recent_event_count!==0||row.all_official_channels_checked!==false||!/^[0-9a-f]{64}$/.test(row.feed_response_sha256||''))return null;
  let url;try{url=new URL(row.official_url);}catch{return null;}
  if(url.protocol!=='https:'||!['RSS','ATOM','ICS','HTML'].includes(row.feed_format))return null;
  return{source:url.hostname,label:'Проверка официальной ленты проекта',value:`в возвращённой выборке ${row.feed_format} пригодных датированных событий не найдено; проверена только эта лента, отсутствие событий во всех каналах не утверждается`};
 }
 if(row.block_id==='N10'&&row.metric_family==='PRECOMMITTED_TECHNICAL_PLAN'){
  if(row.plan_status!=='CLOSED'||row.liquidation_as_target!==false||!row.scenario_receipt_id||!['LONG','SHORT'].includes(row.plan_direction)||![row.entry_price,row.target_price,row.invalidation_price].every(v=>number(v)!==null&&v>0))return null;
  const ordered=row.plan_direction==='LONG'?row.invalidation_price<row.entry_price&&row.target_price>row.entry_price:row.invalidation_price>row.entry_price&&row.target_price<row.entry_price;
  if(!ordered)return null;
  return{source:'HTX / сохранённый сценарий',label:'Проверенный технический сценарий',value:`${row.plan_direction}: вход ${fmt(row.entry_price)}, цель ${fmt(row.target_price)}, отмена ${fmt(row.invalidation_price)} USDT; заранее сохранённый сценарий, разрешение входа проверяется отдельно`};
 }
 if(row.block_id==='N02'&&row.metric_family==='TOTAL_SUPPLY_OBSERVATION'){
  if(!raw(row.total_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||row.supply_delta_base_units!==null)return null;
  const native=row.asset_kind==='NATIVE';
  if(native&&(row.chain!=='near'||row.native_asset_id!=='near:mainnet'||row.htx_contract!=='NEAR-USDT'||row.decimals!==24||row.token_address!==null))return null;
  return{source:native?'NEAR mainnet RPC':'публичный RPC',label:native?'Наблюдение предложения нативного NEAR':'Наблюдение предложения токена',value:`${tokenAmount(row.total_supply_base_units,row.decimals)} ${native?'NEAR':'токенов'}; одно подтверждённое наблюдение; изменение предложения и будущие разблокировки этим не проверены`};
 }
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
 const execution=consumeCanonicalExecutionContext({contract:canonical?.metadata?.contract,run_id:canonical?.run_id,snapshot_id:canonical?.snapshot_id,observed_ts:canonical?.observed_ts,execution_context_source:canonical?.metadata?.execution_context_source});
 const stored=list(canonical?.metadata?.supporting_context?.facts);
 return [...available.facts,...execution.facts].filter(row=>stored.some(f=>f.evidence_id===row.evidence_id&&f.physical_root_key===row.physical_root_key&&f.label===row.label&&f.value===row.value));
}

// Proof is based on the final formatter output, including its bounded fact limit.
// A label in metadata or a completed HTTP call cannot establish actual use.
export function auditRenderedBlockResults({canonical,manual,telegram}={}){
 const contract=canonical?.metadata?.contract,now=canonical?.observed_ts;
 const available=consumeBlockResultContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract,now});
 available.facts.push(...consumeCanonicalExecutionContext({contract,run_id:canonical?.run_id,snapshot_id:canonical?.snapshot_id,observed_ts:now,execution_context_source:canonical?.metadata?.execution_context_source}).facts);
 const printed=manual?.ok===true&&typeof manual.text==='string'?manual.text:null;
 const receipts=confirmedBlockContextFacts(canonical).filter(row=>printed?.includes(`- ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,evidence_ids:row.evidence_ids||[row.evidence_id],physical_root_keys:row.physical_root_keys||[row.physical_root_key],source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,source:row.source,consumer:'MANUAL_CONFIRMED_CONTEXT',score_contribution:0}));
 const payload=telegram?.ok===true&&typeof telegram.text==='string'&&Boolean(canonical?.analytical_fingerprint)&&telegram.analytical_fingerprint===canonical.analytical_fingerprint?telegram.text:null;
 const telegramReceipts=confirmedBlockContextFacts(canonical).filter(row=>payload?.includes(`• ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,consumer:'APPROVED_TELEGRAM_PAYLOAD_CONTEXT',score_contribution:0}));
 return{version:BLOCK_RESULT_CONTEXT_VERSION,contract,run_id:canonical?.run_id??null,snapshot_id:canonical?.snapshot_id??null,status:printed?'RENDERED_OUTPUT_VERIFIED':'FORMATTER_OUTPUT_NOT_CONFIRMED',context_receipts:receipts,used_context_block_ids:[...new Set(receipts.map(row=>row.block_id))],available_not_rendered_evidence_ids:available.facts.filter(row=>!receipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_payload_status:payload?'APPROVED_PAYLOAD_TEXT_OBSERVED':'APPROVED_PAYLOAD_NOT_CONFIRMED',telegram_context_receipts:telegramReceipts,telegram_used_context_block_ids:[...new Set(telegramReceipts.map(row=>row.block_id))],telegram_available_not_rendered_evidence_ids:available.facts.filter(row=>!telegramReceipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_delivery_proven:false,telegram_message_id:null,entry_authorized:false,internal_only:true};
}
