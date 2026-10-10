import {validateJointFlowEvidence} from './joint-spot-futures-flow.mjs';
import {normalizePublishedMonthlySchedule,SUI_MONTHLY_SCHEDULE_ROUTE} from './published-monthly-supply-schedule.mjs';
import {verifiedWikimediaEvidencePage} from './wikimedia-page-binding.mjs';
import {verifiedNativeEvmContextRow,NATIVE_EVM_NETWORKS} from './native-evm-finalized-context.mjs';
import {normalizeXrplNativePayments} from './xrpl-native-payments.mjs';
import {normalizeStellarPublishedSupply} from './stellar-primary-supply.mjs';
import {normalizeHederaPublishedSupply} from './hedera-primary-supply.mjs';
import {normalizeNativeLedgerPair} from './native-ledger-supply.mjs';
import {plainContextFact,omitTelegramCurrencies} from './telegram-plain-facts.mjs';
import {derivePublishedCalendarContext} from './published-token-calendar.mjs';
import {normalizeCoinpaprikaMarketSupply} from './coinpaprika-market-supply.mjs';
import {deriveDeribitOptionRisk} from './deribit-option-risk-context.mjs';
import {SOLANA_MAINNET_GENESIS} from './solana-native-supply.mjs';
import {PAUSED_BLOCKS,validateEvidenceV2,evidenceDedupKey} from './evidence-v2.mjs';
import {deriveDeltaOptionRisk} from './delta-options-evidence.mjs';
import {deriveCoinmetricsSupplyContext} from './coinmetrics-supply-context.mjs';
import {consumeCanonicalExecutionContext} from './execution-report-context.mjs';
import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
import {consumeSectorContext} from './sector-context.mjs';

export const BLOCK_RESULT_CONTEXT_VERSION='block-result-context-v11-verified-native-evm-20261007';
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
 if(row.block_id==='N04'&&row.metric_family==='XRPL_VALIDATED_NATIVE_PAYMENT_SAMPLE'){
  const rebuilt=normalizeXrplNativePayments({contract:row.htx_contract,identity:{chain:'xrp',asset_kind:'NATIVE',native_asset_id:'xrp:mainnet',contract_or_mint:null},ledger_payload:row.validated_ledger_payload,supply_pair_proof:row.supply_pair_proof,observed_ts:row.observed_ts}).evidence?.[0];
  if(!rebuilt||rebuilt.evidence_id!==row.evidence_id||rebuilt.raw_hash!==row.raw_hash||rebuilt.source_ts!==row.source_ts||JSON.stringify(rebuilt.native_payments)!==JSON.stringify(row.native_payments)||row.exchange_labels_verified!==false||row.entry_authorized!==false||row.directional_strength!==null||row.risk_strength!==null||now-row.source_ts>20*60_000)return null;
  const example=row.native_payments.slice(0,3).map(p=>`${tokenAmount(p.delivered_drops,6)} XRP`).join('; ');
  return{source:'XRPL / InFTF mainnet RPC',label:'Подтверждённые переводы нативного XRP',value:`${row.native_payments.length} успешных платежей в ограниченной выборке ledger ${row.ledger_index}; фактически полученные суммы, примеры: ${example}. Это часть платежей одного ledger, принадлежность адресов биржам, накопление и направление рынка не установлены`};
 }

 if(row.block_id==='N02'&&row.metric_family==='HEDERA_PUBLISHED_SUPPLY_METRICS'){
  const rebuilt=normalizeHederaPublishedSupply({contract:row.htx_contract,identity:{chain:'hedera',asset_kind:'NATIVE',native_asset_id:'hedera:mainnet',contract_or_mint:null},payload:row.primary_payload,observed_ts:row.observed_ts}).evidence?.[0];
  if(!rebuilt||Object.entries(rebuilt).some(([key,value])=>JSON.stringify(value)!==JSON.stringify(row[key])))return null;
  return{source:'Hedera mainnet mirror',label:'Опубликованное предложение HBAR',value:`выпущено ${tokenAmount(row.supply_values_base_units.released_supply,8)} HBAR из общего предложения ${tokenAmount(row.supply_values_base_units.total_supply,8)} HBAR; остаток ${tokenAmount(row.supply_values_base_units.unreleased_supply,8)} HBAR. Метрика released supply источника; изменение выпуска и будущие разблокировки этим наблюдением не проверены`};
 }
 if(row.block_id==='N02'&&row.metric_family==='STELLAR_PUBLISHED_SUPPLY_METRICS'){
  const rebuilt=normalizeStellarPublishedSupply({contract:row.htx_contract,identity:{chain:'stellar',asset_kind:'NATIVE',native_asset_id:'stellar:mainnet',contract_or_mint:null},payload:row.primary_payload,observed_ts:row.observed_ts}).evidence?.[0];
  if(!rebuilt||rebuilt.evidence_id!==row.evidence_id||rebuilt.raw_hash!==row.raw_hash||rebuilt.source_ts!==row.source_ts||JSON.stringify(rebuilt.supply_values_base_units)!==JSON.stringify(row.supply_values_base_units)||row.chain_finalized_block_verified!==false||row.burn_or_buyback_change_verified!==false||row.directional_strength!==null||row.risk_strength!==null)return null;
  return{source:'Stellar Development Foundation',label:'Предложение XLM по данным фонда',value:`общее ${tokenAmount(row.supply_values_base_units.totalSupply,7)} XLM; в обращении ${tokenAmount(row.supply_values_base_units.circulatingSupply,7)} XLM; опубликованные компоненты согласованы. Это сведения фонда, финализированный блок, изменение сжиганий и будущие разблокировки не проверены`};
 }
 if(['N02','N03'].includes(row.block_id)&&row.chain==='xrp'&&['TOTAL_SUPPLY_OBSERVATION','SUPPLY_DECREASE','SUPPLY_INCREASE','SUPPLY_UNCHANGED','SUPPLY_REDUCTION_CHECK'].includes(row.metric_family)){
  const pair=normalizeNativeLedgerPair({...row.native_ledger_pair_payload,observed_ts:now}),h=pair.current,p=pair.previous;
  if(pair.status!=='CLOSED'||row.provider_id!=='XRPL_NATIVE_SUPPLY'||row.upstream_id!=='XRPL_INFTF_MAINNET_RPC'||row.asset_id!=='xrp:native:mainnet'||row.native_asset_id!=='xrp:mainnet'||row.htx_contract!=='XRP-USDT'||row.decimals!==6||h.supply!==row.total_supply_base_units||h.block_ref!==row.block_ref||h.source_ts!==row.source_ts||row.directional_strength!==null||row.risk_strength!==null)return null;
  if(row.block_id==='N02'&&row.metric_family==='TOTAL_SUPPLY_OBSERVATION'&&row.supply_delta_base_units===null)return{source:'XRPL / InFTF mainnet RPC',label:'Подтверждённое общее предложение XRP',value:`${tokenAmount(h.supply,6)} XRP по валидированному ledger ${h.ledger_index}; обращающееся предложение и будущие разблокировки этим не проверены`};
  const delta=BigInt(h.supply)-BigInt(p.supply);
  if(row.previous_supply_base_units!==p.supply||row.previous_block_ref!==p.block_ref||row.previous_source_ts!==p.source_ts||row.supply_delta_base_units!==String(delta))return null;
  return{source:'XRPL / InFTF mainnet RPC',label:'Изменение общего предложения XRP',value:`${delta<0n?'−':delta>0n?'+':''}${tokenAmount(String(delta<0n?-delta:delta),6)} XRP между соседними валидированными ledger ${p.ledger_index} и ${h.ledger_index}; отдельная транзакция и её причина, выкуп и влияние на цену не подтверждены`};
 }
 if(row.block_id==='N07'&&['OFFICIAL_SOFTWARE_RELEASE','OFFICIAL_RELEASE_SUBSET_CHECK'].includes(row.metric_family)){
  if(row.provider_id!=='OFFICIAL_EVENTS'||row.upstream_id!==`OFFICIAL_GITHUB:${row.github_repository}`||row.entry_authorized!==false||row.directional_strength!==null||row.risk_strength!==null||row.all_official_channels_checked!==false)return null;
  if(row.metric_family==='OFFICIAL_SOFTWARE_RELEASE'){
   if(row.mainnet_deployment_verified!==false||row.source_clock_policy!=='ORIGINAL_RELEASE_PUBLISHED_AT'||row.official_url!==`https://github.com/${row.github_repository}/releases/tag/${encodeURIComponent(row.release_tag)}`||!row.event_title)return null;
   return{source:`официальный GitHub / ${row.github_repository}`,label:'Опубликован выпуск программного обеспечения',value:`${row.event_title}; ${new Date(row.source_ts).toISOString().slice(0,10)}; публикация релиза, установка в основной сети и влияние на цену не подтверждены`};
  }
  if(row.source_clock_policy!=='OBSERVED_OFFICIAL_RELEASE_SUBSET_QUERY'||row.recent_event_count!==0||row.lookback_days!==7||row.maximum_returned_rows!==10||!/^[a-f0-9]{64}$/.test(row.feed_response_sha256||''))return null;
  return{source:`официальный GitHub / ${row.github_repository}`,label:'Проверка опубликованных выпусков проекта',value:`в возвращённой выборке до10 выпусков пригодных стабильных релизов за последние7 дней нет; другие страницы и каналы объявлений этим не проверены`};
 }

 if(row.block_id==='N01'&&row.metric_family==='OFFICIAL_PUBLISHED_MONTH_END_SUPPLY_PROJECTION'){
  const rebuilt=normalizePublishedMonthlySchedule({contract:row.htx_contract,asset_identity:{chain:'sui',asset_kind:'NATIVE',native_asset_id:'sui:mainnet',contract_or_mint:null},payload:row.primary_payload,source_url:SUI_MONTHLY_SCHEDULE_ROUTE.url,observed_ts:row.observed_ts}).evidence?.[0];
  if(!rebuilt||now>=rebuilt.expires_at||Object.entries(rebuilt).some(([key,value])=>JSON.stringify(value)!==JSON.stringify(row[key]))||row.schedule_context.projections[0].period_end_exclusive_ts<=now)return null;
  const months=row.schedule_context.projections.map(p=>`${p.month}: к концу месяца плановое предложение ${fmt(p.planned_month_end_circulation_tokens)} SUI, изменение к предыдущему месяцу +${fmt(p.planned_increase_over_previous_month_tokens)} SUI`);
  return{source:'Sui Foundation / месячный график',label:'План предложения SUI по месяцам',value:`${months.join('; ')}. План может изменяться; точные даты разблокировки, индивидуальные позиции и фактические переводы токенов этим API не подтверждены`};
 }
 if(row.block_id==='N01'&&row.metric_family==='PROVIDER_PUBLISHED_FUTURE_TOKEN_CALENDAR'){
  if(row.provider_id!=='DEFILLAMA_PUBLISHED_CALENDAR'||row.upstream_id!=='DEFILLAMA_PUBLISHED_VESTING_CALENDAR'||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||row.official_confirmation!==false||row.actual_unlock_transfer_verified!==false||row.entry_authorized!==false||row.source_clock_policy!=='PUBLIC_PAGE_GENERATION_NOT_UNLOCK_EXECUTION')return null;
  const c=derivePublishedCalendarContext({page:row.provider_calendar_page,reference:row.provider_asset_reference,observed_ts:row.observed_ts,now});
  if(!c||c.asset_id!==row.asset_id||row.provider_asset_reference.contract!==row.htx_contract||c.source_ts!==row.source_ts||JSON.stringify(c)!==JSON.stringify(row.calendar_context))return null;
  const categories={insiders:'команда',privateSale:'частные инвесторы',noncirculating:'не обращающиеся токены'},events=c.events.slice(0,4).map(e=>`${new Date(e.effective_at).toISOString().replace('T',' ').slice(0,16)} UTC: ${fmt(e.amount_tokens)} ${c.token_unit} (${categories[e.category]||e.category})`);
  return{source:'DefiLlama / опубликованный календарь',label:'Запланированные разблокировки по календарю поставщика',value:`${events.join('; ')}; суммы перечислены раздельно. Это календарь поставщика: официальное подтверждение исполнения и фактический перевод токенов не проверены`};
 }

 if(row.block_id==='N02'&&row.metric_family==='PROVIDER_AGGREGATED_SUPPLY_CONTEXT'){
  if(row.provider_id!=='COINPAPRIKA_SECTOR'||row.upstream_id!=='COINPAPRIKA_AGGREGATED_VENUES'||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||row.chain_finality_verified!==false||row.supply_change_or_unlock_inferred!==false||row.entry_authorized!==false||row.supply_unit!=='PROVIDER_REPORTED_ASSET_UNITS'||row.source_clock_policy!=='PROVIDER_RECORD_TIMESTAMP_NOT_CHAIN_FINALITY')return null;
  const actual=normalizeCoinpaprikaMarketSupply({reference:row.provider_reference,ticker:row.provider_ticker,contract:row.htx_contract,observed_ts:row.observed_ts}),fact=actual.evidence?.[0];
  if(!fact||fact.asset_id!==row.asset_id||fact.source_ts!==row.source_ts||JSON.stringify(fact.supply_values)!==JSON.stringify(row.supply_values)||now-row.source_ts>900000)return null;
  const labels={circulating_supply:'в обращении',total_supply:'общее предложение',max_supply:'максимум'},parts=Object.entries(row.supply_values).map(([key,n])=>`${labels[key]} ${fmt(n)}`);
  return{source:'CoinPaprika',label:'Предложение по данным поставщика',value:`${parts.join('; ')} единиц актива; обновление ${new Date(row.source_ts).toISOString()}. Это сводные сведения поставщика, финализированное состояние сети и будущие разблокировки ими не подтверждены`};
 }

 if(['ETHEREUM_FINALIZED_EIP1559_BLOCK','EVM_FINALIZED_SUCCESSFUL_NATIVE_TRANSACTION'].includes(row.producer)){
  const verified=verifiedNativeEvmContextRow(row,{now});if(!verified)return null;const symbol=NATIVE_EVM_NETWORKS[row.chain].symbol;
  if(row.block_id==='N03')return{source:'Ethereum / финализированный RPC',label:'Сжигание базовой комиссии Ethereum',value:`${tokenAmount(row.burned_base_units,18)} ETH в финализированном блоке ${row.block_ref}; только базовая комиссия исполнения, blob-комиссии и итоговое изменение предложения не включены; выкуп и направление цены не установлены`};
  if(row.block_id==='N04')return{source:symbol+' / финализированный RPC',label:'Подтверждённый перевод нативного '+symbol,value:`${tokenAmount(row.amount_base_units,18)} ${symbol} в успешной транзакции ${row.tx_hash}; выборка до двух транзакций одного финализированного блока, внутренние переводы и принадлежность адресов биржам не проверены; приток, отток и направление рынка не установлены`};
  return null;
 }
 if(row.block_id==='N04'&&row.metric_family==='NATIVE_TRANSFER'&&row.producer==='SOLANA_FINALIZED_NATIVE_SYSTEM_TRANSFER'){
  const signature=row.tx_hash,slot=String(row.block_ref??'');
  if(row.provider_id!=='CHAIN_RPC'||row.upstream_id!=='SOLANA_MAINNET_RPC'||row.asset_id!=='solana:native:mainnet'||row.htx_contract!=='SOL-USDT'||row.chain!=='solana'||row.native_asset_id!=='solana:mainnet'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature||'')||!/^\d+$/.test(String(row.instruction_index))||!/^\d+$/.test(slot)||!raw(row.amount_base_units)||BigInt(row.amount_base_units)<=0n||row.quantity_units!=='LAMPORTS'||row.market_kind!=='ONCHAIN_NATIVE_TRANSFER'||row.event_is_not_market_direction!==true||row.exchange_labels_verified!==false||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||row.source_ts>now||now-row.source_ts>20*60_000)return null;
  return{source:'Solana mainnet RPC',label:'Финализированный перевод нативного SOL',value:`${row.amount_base_units} лампортов в одной инструкции финализированной транзакции, слот ${slot}, ${new Date(row.source_ts).toISOString()}; ограниченная выборка системной программы, принадлежность адресов биржам и направление рынка не установлены`};
 }
 if(row.block_id==='N04'&&row.metric_family==='TOKEN_TRANSFER'&&row.producer==='SOLANA_FINALIZED_TOKEN_BALANCE_DIFF'){
  const mint=row.token_address,signature=row.tx_hash,slot=String(row.block_ref??'');
  if(row.provider_id!=='CHAIN_RPC'||row.upstream_id!=='SOLANA_MAINNET_RPC'||row.chain!=='solana'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint||'')||row.asset_id!==`solana:${mint}`||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature||'')||row.origin_event_id!==signature||!/^\d+$/.test(slot)||!Number.isSafeInteger(Number(slot))||!raw(row.amount_base_units)||BigInt(row.amount_base_units)<=0n||row.quantity_units!=='RAW_BASE_UNITS_NO_USD_CONVERSION'||row.market_kind!=='ONCHAIN_TOKEN_TRANSFER'||row.event_is_not_market_direction!==true||row.coverage_fraction!==0||row.directional_strength!==null||row.risk_strength!==null||row.source_ts>now||now-row.source_ts>20*60_000)return null;
  return{source:'Solana mainnet RPC',label:'Перераспределение балансов токена в Solana',value:`одна финализированная транзакция в слоте ${slot}, ${new Date(row.source_ts).toISOString()}: уменьшения балансов равны увеличениям, ${row.amount_base_units} минимальных единиц; ограниченная выборка по точному mint, принадлежность биржам и направление рынка не установлены`};
 }
 if(row.block_id==='N02'&&row.metric_family==='PROVIDER_DAILY_NATIVE_SUPPLY_HISTORY'){
  const d=row.supply_history_context,identity={chain:row.asset_id?.split(':')[0],asset_kind:'NATIVE',native_asset_id:row.asset_id?.replace(':native:mainnet',':mainnet'),contract_or_mint:null};
  if(row.provider_id!=='COINMETRICS_SUPPLY'||row.upstream_id!=='COINMETRICS_NETWORK_DATA_COMMUNITY'||row.historical_only!==true||row.source_clock_policy!=='PROVIDER_DAILY_RECORD_TIMESTAMP_ONLY')return null;
  const actual=deriveCoinmetricsSupplyContext({contract:row.htx_contract,identity,catalog:row.catalog,series:row.series,observed_ts:row.observed_ts});
  if(!actual||actual.asset_id!==row.asset_id||actual.source_ts!==row.source_ts||JSON.stringify(actual)!==JSON.stringify(d))return null;
  const amount=v=>v.replace('.',','),symbol=row.htx_contract.slice(0,-5);
  return{source:'CoinMetrics / ежедневная история',label:'История предложения по данным CoinMetrics',value:`на ${new Date(actual.source_ts).toISOString().slice(0,10)}: ${amount(actual.latest_native_units)} ${symbol}; изменение между ${new Date(actual.history_start_ts).toISOString().slice(0,10)} и ${new Date(actual.source_ts).toISOString().slice(0,10)}: ${amount(actual.change_7_days_native_units)} ${symbol}; 8 ежедневных записей, исторические данные поставщика, текущий подтверждённый блок и причины изменения не проверены`};
 }

 if(row.block_id==='N14'&&row.metric_family==='DELTA_SCOPED_OPTION_IV'){
  if(row.provider_id!=='DELTA_OPTIONS'||row.upstream_id!=='DELTA_EXCHANGE_INDIA_PUBLIC_OPTIONS'||row.base_currency!==row.htx_contract.slice(0,-5)||row.source_clock_policy!=='PROVIDER_MICROSECOND_TIMESTAMP_ONLY'||row.source_is_htx_execution_price!==false)return null;
  const declared=row.option_risk_context,risk=deriveDeltaOptionRisk({samples:declared?.samples,base_currency:row.base_currency,observed_ts:row.observed_ts});
  if(!risk||risk.status!==declared.status||risk.source_ts!==row.source_ts||!['sample_count','call_count','put_count','expiration_timestamp','mark_iv_median_pct','mark_iv_min_pct','mark_iv_max_pct'].every(k=>eq(risk[k],declared[k])))return null;
  return{source:'Delta Exchange',label:'Опционная волатильность актива на Delta',value:`медиана волатильности по котировкам ${fmt(risk.mark_iv_median_pct)}%, диапазон ${fmt(risk.mark_iv_min_pct)}–${fmt(risk.mark_iv_max_pct)}%; ${risk.call_count} колл и ${risk.put_count} пут около базовой цены (±10%), экспирация ${new Date(risk.expiration_timestamp).toISOString().replace('T',' ').slice(0,16)} UTC, расчёты в USD; данные этой площадки, направление и разрешение сделки не назначены`};
 }
 if(row.block_id==='N10'&&row.metric_family==='ROLLING_24H_PRICE_RANGE_CONTEXT'){
  if(row.upstream_id!=='HTX_OFFICIAL_ROLLING_MARKET_SUMMARY'||row.source_clock_policy!=='HTX_PRIMARY_ROLLING_24H_SUMMARY'||row.closed_candle_claim!==false||row.signed_trade_flow_claim!==false||row.entry_authorized_by_context!==false||row.liquidation_as_target!==false||![row.range_low,row.range_high,row.last_price,row.range_pct].every(v=>number(v)!==null)||!(row.range_low>0&&row.range_high>=row.range_low&&row.last_price>=row.range_low&&row.last_price<=row.range_high)||!eq(row.range_pct,(row.range_high/row.range_low-1)*100))return null;
  const price=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:12}).format(v);
  return{source:'HTX / рыночная сводка',label:'Наблюдаемый диапазон цены за 24 часа',value:`${price(row.range_low)}–${price(row.range_high)} USDT, ширина ${fmt(row.range_pct)}%; последняя цена ${price(row.last_price)} USDT; скользящая суточная сводка, будущие цели и направление сделки этим не подтверждены`};
 }
 if(row.block_id==='N10'&&row.metric_family==='CLOSED_CANDLE_RANGE_CONTEXT'){
  const intervals={'1min':60000,'5min':300000,'15min':900000,'30min':1800000,'60min':3600000,'4hour':14400000};
  if(row.source_clock_policy!=='HTX_PRIMARY_RESPONSE_AND_CLOSED_CANDLE_IDS'||row.upstream_id!=='HTX_OFFICIAL_CLOSED_CANDLES'||row.candle_count!==20||row.all_candles_closed!==true||row.entry_authorized_by_context!==false||row.liquidation_as_target!==false||row.interval_ms!==intervals[row.period]||row.window_end!==Math.floor(row.source_ts/row.interval_ms)*row.interval_ms||row.window_start!==row.window_end-20*row.interval_ms||![row.range_low,row.range_high,row.last_closed_price,row.range_pct].every(v=>number(v)!==null)||!(row.range_low>0&&row.range_high>=row.range_low&&row.last_closed_price>=row.range_low&&row.last_closed_price<=row.range_high)||!eq(row.range_pct,(row.range_high/row.range_low-1)*100))return null;
  const price=v=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:12}).format(v);
  return{source:'HTX / закрытые свечи',label:'Фактический ценовой диапазон',value:`20 закрытых свечей ${row.period}: ${price(row.range_low)}–${price(row.range_high)} USDT, ширина ${fmt(row.range_pct)}%; цена последней закрытой свечи ${price(row.last_closed_price)} USDT; это наблюдаемый диапазон, цели и разрешение входа проверяются отдельно`};
 }

 if(row.block_id==='N01'&&row.metric_family==='OFFICIAL_INITIAL_DISTRIBUTION_TERMS'){
  if(row.parser_id!=='CARDANO_INITIAL_DISTRIBUTION_V1'||row.asset_id!=='cardano:native:mainnet'||row.htx_contract!=='ADA-USDT'||row.official_url!=='https://cardano.org/genesis/'||row.source_clock_policy!=='OBSERVED_PRIMARY_DOCUMENT_QUERY'||row.scope!=='HISTORICAL_INITIAL_DISTRIBUTION_ONLY'||row.future_unlock_schedule_verified!==false||row.actual_unlock_transfer_verified!==false||row.ongoing_issuance_excluded!==false||row.initial_supply_tokens!=='31112484646'||row.public_sale_tokens!=='25927070538'||!/^[0-9a-f]{64}$/.test(row.document_sha256||''))return null;
  return{source:'cardano.org',label:'Официальное первоначальное распределение ADA',value:'публичные продажи: 25 927 070 538 ADA; предложение при запуске: 31 112 484 646 ADA. Это историческое распределение 2015–2017 годов; будущие разблокировки и прекращение эмиссии этим не подтверждены'};
 }
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
 if(row.block_id==='N02'&&row.metric_family==='CARDANO_ACTIVE_SUPPLY_OBSERVATION'){
  if(row.provider_id!=='KOIOS_NATIVE_SUPPLY'||row.upstream_id!=='KOIOS_CARDANO_MAINNET'||row.chain!=='cardano'||row.asset_kind!=='NATIVE'||row.native_asset_id!=='cardano:mainnet'||row.htx_contract!=='ADA-USDT'||row.token_address!==null||row.supply_measure!=='CARDANO_ACTIVE_SUPPLY'||row.unit!=='lovelace'||row.provider_query!=='KOIOS_TOTALS_CLOSED_EPOCH'||row.decimals!==6||!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!raw(row.max_supply_base_units)||!Number.isSafeInteger(row.epoch_no)||!Number.isSafeInteger(row.previous_epoch_no)||row.epoch_no!==row.previous_epoch_no+1||row.block_ref!==`epoch:${row.epoch_no}`||row.previous_block_ref!==`epoch:${row.previous_epoch_no}`)return null;
  const delta=BigInt(row.total_supply_base_units)-BigInt(row.previous_supply_base_units);if(String(delta)!==row.supply_delta_base_units)return null;
  return{source:'Koios / Cardano mainnet',label:'Активное предложение нативного ADA',value:`${tokenAmount(row.total_supply_base_units,6)} ADA по завершённой эпохе ${row.epoch_no}; изменение к эпохе ${row.previous_epoch_no}: ${delta<0n?'−':'+'}${tokenAmount(String(delta<0n?-delta:delta),6)} ADA; максимум ${tokenAmount(row.max_supply_base_units,6)} ADA; будущие разблокировки этим не проверены`};
 }
 if(row.block_id==='N03'&&row.metric_family==='SUPPLY_REDUCTION_CHECK'){
  if(row.chain!=='cardano'){
   const providers={ethereum:'PUBLICNODE_RPC',bsc:'PUBLICNODE_RPC',arbitrum:'PUBLICNODE_RPC',base:'PUBLICNODE_RPC',polygon:'PUBLICNODE_RPC',optimism:'PUBLICNODE_RPC',avalanche:'PUBLICNODE_RPC',solana:'SOLANA_MAINNET_RPC',near:'NEAR_MAINNET_RPC'};
   const native=row.asset_kind==='NATIVE',symbol={near:'NEAR',solana:'SOL'}[row.chain],address=row.token_address;
   const exact=native?Boolean(symbol&&row.native_asset_id===`${row.chain}:mainnet`&&row.asset_id===`${row.chain}:native:mainnet`&&row.htx_contract===`${symbol}-USDT`&&address===null&&row.decimals===(row.chain==='near'?24:9)&&(row.chain!=='solana'||row.genesis_hash===SOLANA_MAINNET_GENESIS&&row.commitment==='finalized')):row.asset_kind==='TOKEN'&&row.asset_id===`${row.chain}:${address}`&&(row.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address||''):/^0x[0-9a-f]{40}$/.test(address||''));
   if(!exact||row.provider_id!=='CHAIN_RPC'||row.upstream_id!==providers[row.chain]||row.finality_status!=='FINAL'||row.comparison_policy!=='EXACT_ASSET_DECIMALS_DISTINCT_BLOCK_INCREASING_CLOCK'||!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||!Number.isSafeInteger(row.previous_source_ts)||row.previous_source_ts>=row.source_ts||!row.previous_block_ref||!row.block_ref||row.previous_block_ref===row.block_ref||row.change_cause_verified!==false||row.burn_verified!==false||row.buyback_verified!==false)return null;
   const delta=BigInt(row.total_supply_base_units)-BigInt(row.previous_supply_base_units);if(String(delta)!==row.supply_delta_base_units||row.supply_decreased!==(delta<0n))return null;
   const state=delta<0n?`снижение на ${tokenAmount(String(-delta),row.decimals)}`:delta>0n?`снижения нет, рост на ${tokenAmount(String(delta),row.decimals)}`:'изменения предложения нет';
   return{source:native?`${symbol} mainnet RPC`:'публичный RPC',label:'Проверка уменьшения предложения',value:`между финализированными состояниями ${row.previous_block_ref} и ${row.block_ref}: ${state}${delta===0n?'':native?` ${symbol}`:' токенов'}; только интервал ${new Date(row.previous_source_ts).toISOString()} — ${new Date(row.source_ts).toISOString()}; причина изменения, сжигание и выкуп не подтверждены`};
  }
  if(row.provider_id!=='KOIOS_NATIVE_SUPPLY'||row.upstream_id!=='KOIOS_CARDANO_MAINNET'||row.chain!=='cardano'||row.native_asset_id!=='cardano:mainnet'||row.htx_contract!=='ADA-USDT'||row.supply_measure!=='CARDANO_ACTIVE_SUPPLY'||row.unit!=='lovelace'||row.provider_query!=='KOIOS_TOTALS_CLOSED_EPOCH'||row.decimals!==6||!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!Number.isSafeInteger(row.epoch_no)||!Number.isSafeInteger(row.previous_epoch_no)||row.epoch_no!==row.previous_epoch_no+1||row.change_cause_verified!==false||row.burn_verified!==false||row.buyback_verified!==false)return null;
  const delta=BigInt(row.total_supply_base_units)-BigInt(row.previous_supply_base_units);if(String(delta)!==row.supply_delta_base_units||row.supply_decreased!==(delta<0n))return null;
  const state=delta<0n?`снижение на ${tokenAmount(String(-delta),6)} ADA`:delta>0n?`снижения нет, рост на ${tokenAmount(String(delta),6)} ADA`:'изменения нет';
  return{source:'Koios / Cardano mainnet',label:'Сравнение активного предложения ADA',value:`между завершёнными эпохами ${row.previous_epoch_no} и ${row.epoch_no}: ${state}; причина изменения, сжигание, выкуп и влияние на цену не подтверждены`};
 }
 if(row.block_id==='N02'&&row.metric_family==='TOTAL_SUPPLY_OBSERVATION'){
  if(!raw(row.total_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||row.supply_delta_base_units!==null)return null;
  const native=row.asset_kind==='NATIVE',symbol=row.chain==='near'?'NEAR':row.chain==='solana'?'SOL':null;
  if(native&&(!symbol||row.native_asset_id!==`${row.chain}:mainnet`||row.htx_contract!==symbol+'-USDT'||row.decimals!==(symbol==='NEAR'?24:9)||row.token_address!==null||(symbol==='SOL'&&(row.genesis_hash!==SOLANA_MAINNET_GENESIS||row.commitment!=='finalized'))))return null;
  return{source:native?`${symbol} mainnet RPC`:'публичный RPC',label:native?`Наблюдение предложения нативного ${symbol}`:'Наблюдение предложения токена',value:`${tokenAmount(row.total_supply_base_units,row.decimals)} ${native?symbol:'токенов'}; одно подтверждённое наблюдение; изменение предложения и будущие разблокировки этим не проверены`};
 }
 if(row.block_id==='N14'&&row.metric_family==='ALT_OPTIONS_CATALOG_ABSENCE'){
  if(row.source_clock_policy!=='OBSERVED_STATIC_CATALOG_QUERY'||row.base_currency!==row.htx_contract.replace(/-USDT$/,'')||row.open_instrument_count!==0||row.value!==0||!/^[0-9a-f]{64}$/i.test(row.catalog_response_sha256||''))return null;
  return{source:'Deribit',label:'Доступность опционов актива',value:`в каталоге Deribit на ${new Date(row.source_ts).toISOString().replace('T',' ').slice(0,19)} UTC открытых опционов актива не найдено; сведения относятся только к этой площадке, опционный риск не оценён`};
 }
 if(row.block_id==='N14'&&row.metric_family==='ALT_OPTIONS_LIQUIDITY_CONTEXT'){
  const open=number(row.open_instrument_count),liquid=number(row.liquid_instrument_count);
  if(row.source_clock_policy!=='PROVIDER_TIMESTAMP_ONLY'||row.base_currency!==row.htx_contract.replace(/-USDT$/,'')||!Number.isSafeInteger(open)||open<1||!Number.isSafeInteger(liquid)||liquid<0||liquid>open)return null;
  const scoped=number(row.scoped_instrument_count);
  const scope=Number.isSafeInteger(scoped)&&scoped>0&&scoped<=open&&row.settlement_currency?`; проверено ${scoped} с расчётами в ${row.settlement_currency}`:'';
  const declared=row.option_risk_context,risk=declared?deriveDeribitOptionRisk({samples:declared.samples,base_currency:row.base_currency,settlement_currency:row.settlement_currency,observed_ts:row.observed_ts}):null;
  if(risk&&risk.status===declared.status&&risk.sample_count===declared.sample_count&&eq(risk.mark_iv_median_pct,declared.mark_iv_median_pct)&&eq(risk.mark_iv_min_pct,declared.mark_iv_min_pct)&&eq(risk.mark_iv_max_pct,declared.mark_iv_max_pct)&&risk.expiration_timestamp===declared.expiration_timestamp)return{source:'Deribit',label:'Опционная волатильность актива',value:`mark IV: медиана ${fmt(risk.mark_iv_median_pct)}%, диапазон ${fmt(risk.mark_iv_min_pct)}–${fmt(risk.mark_iv_max_pct)}%; ${risk.call_count} call и ${risk.put_count} put около базовой цены (±10%), экспирация ${new Date(risk.expiration_timestamp).toISOString().slice(0,10)}${scope}; открытых опционов в каталоге ${open}; волатильность этой выборки, направление и разрешение сделки не назначены`};
  return{source:'Deribit',label:'Опционный рынок актива',value:`открытых инструментов ${open}${scope}, с котировками или активностью в проверенной выборке ${liquid}; опционный риск по этой выборке не закрыт, разрешение сделки не назначено`};
 }
 if(row.block_id==='N02'&&row.metric_family==='SUPPLY_UNCHANGED'){
  if(!raw(row.total_supply_base_units)||!raw(row.previous_supply_base_units)||!Number.isSafeInteger(row.decimals)||row.decimals<0||row.decimals>255||BigInt(row.total_supply_base_units)!==BigInt(row.previous_supply_base_units)||row.supply_delta_base_units!=='0')return null;
  return{source:'публичный RPC',label:'Наблюдение предложения токена',value:`${tokenAmount(row.total_supply_base_units,row.decimals)} токенов; между двумя наблюдениями изменения нет; будущие разблокировки этим не проверены`};
 }
 if(row.block_id==='N06'&&row.metric_family==='UNIQUE_AUTHOR_ATTENTION'){
  const start=number(row.window_start),end=number(row.window_end),authors=number(row.value),posts=number(row.original_post_count);
  const native=row.query_identity==='EXACT_OFFICIAL_DOMAIN_NATIVE',market=row.query_identity==='EXACT_HTX_MARKET_PAIR',nativeIdentity=native?{chain:row.chain,asset_kind:'NATIVE',native_asset_id:row.native_asset_id,contract_or_mint:null}:null;
  if(!['EXACT_CONTRACT_OR_MINT','EXACT_OFFICIAL_DOMAIN_NATIVE','EXACT_HTX_MARKET_PAIR'].includes(row.query_identity)||native&&(!exactNativeSectorBinding(nativeIdentity,row.htx_contract)||row.asset_id!==`${row.chain}:native:mainnet`||row.official_domain===null||!/^[a-z0-9.-]+$/.test(row.official_domain))||market&&(row.asset_id!==`htx-futures:${row.htx_contract}`||row.market_pair!==row.htx_contract||row.asset_kind!=='HTX_FUTURES_MARKET'||row.chain!==null)||row.unit!=='unique_authors'||start===null||end===null||end<=start||end>now||row.source_ts!==end||!Number.isSafeInteger(authors)||authors<0||!Number.isSafeInteger(posts)||posts<authors||typeof row.sample_saturated!=='boolean')return null;
  const label=native?'Публичные сообщения с официальным доменом проекта':market?'Публичные сообщения с точной парой HTX':'Публичные сообщения с точным адресом токена',scope=native?`подтверждённому домену ${row.official_domain}`:market?`точной записи ${row.htx_contract.replace('-','/')} вместе с HTX`:'адресу';
  return{source:'Bluesky',label,value:`за ${fmt((end-start)/60000)} минут: ${authors} авторов, ${posts} сообщений${row.sample_saturated?'; выборка ограничена лимитом':''}; поиск только по ${scope}, общий интерес к активу и направление цены этим не подтверждены`};
 }
 if(row.block_id==='N05'){
  if(!validateJointFlowEvidence(row,now))return null;
  const parts=row.components.map(c=>`${c.venue} ${c.market==='SPOT'?'спот':'фьючерсы'}: перевес ${c.imbalance>0?'покупок':'продаж'} ${fmt(Math.abs(c.imbalance)*100)}%`).join('; ');
  return{source:[...new Set(row.components.map(c=>c.venue==='BITGET'?'Bitget':c.venue==='BINANCE'?'Binance':c.venue))].join(' / '),label:'Согласованный поток спота и фьючерсов за четыре часа',value:`${parts}; полные окна сопоставлены, близость направления проверена; баллы и разрешение входа не назначены`};
 }
 if(row.block_id==='N12'&&row.metric_family==='EXACT_SIGNED_RAW_24H'){
  const buy=number(row.buy_quote_turnover_usdt),sell=number(row.sell_quote_turnover_usdt),start=number(row.window_start),end=number(row.window_end),count=number(row.raw_trade_count);
  if(row.provider_id!=='HTX_SIGNED_RAW_TAPE'||row.upstream_id!=='HTX_OFFICIAL_RAW_FILLS'||row.source_clock_policy!=='IMMUTABLE_EXACT_RAW_MINUTES'||row.not_candle_signed_estimate!==true||row.entry_authorized!==false||row.unit!=='USDT'||row.verified_minutes!==1440||!Number.isSafeInteger(start)||start%60000||end-start!==86400000||end!==row.source_ts||end>now||now-end>180000||!positive(buy)||!positive(sell)||!Number.isSafeInteger(count)||count<0||count!==row.factual_trade_count||!eq(row.value,buy-sell)||!/^[a-f0-9]{64}$/.test(row.raw_minute_root_sha256||''))return null;
  return{source:'HTX / исходные сделки',label:'Подтверждённый поток фьючерсных сделок за 24 часа',value:`${count} исходных сделок: покупки ${fmt(buy)}, продажи ${fmt(sell)} USDT; разница ${fmt(buy-sell)} USDT; каждую из 1440 минут проверили по фактическому счётчику; направление и разрешение сделки не назначены`};
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
 if(row.block_id==='N06'&&row.metric_family==='ENCYCLOPEDIA_PAGEVIEW_CONTEXT'){
  const page=verifiedWikimediaEvidencePage(row);if(!page)return null;
  if(row.provider_id!=='WIKIMEDIA_ATTENTION'||row.upstream_id!=='WIKIMEDIA_AQS_PAGEVIEWS'||row.source_clock_policy!=='PUBLISHED_COMPLETE_UTC_DAILY_PAGEVIEW_ROWS'||row.provider_role!=='ADDITIONAL_ATTENTION_CONTEXT'||row.unique_traders_claim!==false||row.directional_vote!==false||row.day_count!==14||![row.recent_7day_views,row.previous_7day_views].every(x=>Number.isSafeInteger(x)&&x>=0)||row.window_end!==row.source_ts||row.window_end-row.window_start!==14*86400000||!/^[0-9a-f]{64}$/.test(row.series_sha256||''))return null;
  return{source:'Wikimedia / Wikipedia',label:`Внимание к статье ${page.label}`,value:`${row.recent_7day_views} просмотров за последние 7 опубликованных полных дней против ${row.previous_7day_views} за предыдущие 7; окно заканчивается ${new Date(row.window_end).toISOString().slice(0,10)} UTC. Это просмотры статьи, число трейдеров и направление цены не установлены`};
 }
 if(row.block_id==='N07'&&row.metric_family==='OFFICIAL_ANNOUNCEMENT'){
  const title=String(row.event_title||'').trim();let url;
  try{url=new URL(row.official_url);}catch{return null;}
  if(!title||url.protocol!=='https:')return null;
  return{source:url.hostname,label:'Официальное объявление проекта',value:`${title.slice(0,240)}; ${new Date(row.source_ts).toISOString().slice(0,10)}; оценка направления не назначена`};
 }
 if(row.block_id==='N07'&&row.metric_family==='HTX_OFFICIAL_ASSET_ANNOUNCEMENT'){
  const title=String(row.event_title||'').trim();let url;try{url=new URL(row.official_url);}catch{return null;}
  if(row.provider_id!=='HTX_OFFICIAL_ANNOUNCEMENTS'||row.upstream_id!=='HTX_OFFICIAL_SUPPORT'||url.protocol!=='https:'||!/(^|\.)htx\.com$/i.test(url.hostname)||!title||row.common_upstream_not_independent_vote!==true||row.score_contribution!==0||row.entry_authorized!==false)return null;
  return{source:'HTX / официальные объявления',label:'Официальная публикация по активу',value:`${title.slice(0,240)}; опубликовано ${new Date(row.source_ts).toISOString().replace('T',' ').slice(0,19)} UTC; направление и разрешение сделки не назначены`};
 }
 if(row.block_id==='N07'&&row.metric_family==='HTX_OFFICIAL_ANNOUNCEMENT_BOUNDED_ABSENCE'){
  if(row.provider_id!=='HTX_OFFICIAL_ANNOUNCEMENTS'||row.upstream_id!=='HTX_OFFICIAL_SUPPORT'||row.recent_event_count!==0||row.lookback_days!==14||row.all_htx_announcement_channels_checked!==false||row.common_upstream_not_independent_vote!==true||row.score_contribution!==0||row.entry_authorized!==false||!/^[0-9a-f]{64}$/.test(row.catalog_response_sha256||''))return null;
  return{source:'HTX / официальные объявления',label:'Проверка публикаций по точному контракту',value:'в возвращённой официальной ленте HTX за 14 дней публикаций с точным контрактом не найдено; проверена только эта лента, отсутствие событий во всех каналах не утверждается'};
 }
 return null;
}

// This consumer only uses already acquired, exact, validated facts. It neither
// creates a missing score nor interprets raw transfers or social counts as trades.
export function consumeBlockResultContext({evidence=[],contract,now}={}){
 const facts=[],seen=new Set();
 evidence=list(evidence).filter(row=>!PAUSED_BLOCKS[row?.block_id]);
 if(!/^[^\s-]+-USDT$/.test(String(contract))||number(now)===null)return{status:'NOT_CLOSED',facts,internal_only:true};
 for(const row of list(evidence)){
  if(PAUSED_BLOCKS[row?.block_id]||row?.htx_contract!==contract||!validateEvidenceV2(row,{decision_ts:now}).usable||number(row.observed_ts)===null||row.source_ts>row.observed_ts||row.observed_ts>now)continue;
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
function availableCanonicalContextFacts(canonical){
 const available=consumeBlockResultContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract:canonical?.metadata?.contract,now:canonical?.observed_ts});
 const execution=consumeCanonicalExecutionContext({contract:canonical?.metadata?.contract,run_id:canonical?.run_id,snapshot_id:canonical?.snapshot_id,observed_ts:canonical?.observed_ts,execution_context_source:canonical?.metadata?.execution_context_source});
 const sector=consumeSectorContext({evidence:canonical?.metadata?.internal_market_context?.evidence_v2?.evidence,contract:canonical?.metadata?.contract,asset_identity:canonical?.metadata?.internal_market_context?.candidate_context?.asset_identity,now:canonical?.observed_ts});
 return [...available.facts,...execution.facts,...sector.facts];
}
export function confirmedBlockContextFacts(canonical){
 const stored=list(canonical?.metadata?.supporting_context?.facts);
 return availableCanonicalContextFacts(canonical).filter(row=>stored.some(f=>f.evidence_id===row.evidence_id&&f.physical_root_key===row.physical_root_key&&f.label===row.label&&f.value===row.value));
}

// Proof is based on the final formatter output, including its bounded fact limit.
// A label in metadata or a completed HTTP call cannot establish actual use.
export function auditRenderedBlockResults({canonical,manual,telegram}={}){
 const contract=canonical?.metadata?.contract,now=canonical?.observed_ts;
 const available={facts:availableCanonicalContextFacts(canonical)};
 const printed=manual?.ok===true&&typeof manual.text==='string'?manual.text:null;
 const receipts=confirmedBlockContextFacts(canonical).filter(row=>printed?.includes(`- ${row.label}: ${row.value}`)).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,evidence_ids:row.evidence_ids||[row.evidence_id],physical_root_keys:row.physical_root_keys||[row.physical_root_key],source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,source:row.source,consumer:'MANUAL_CONFIRMED_CONTEXT',score_contribution:0}));
 const payload=telegram?.ok===true&&typeof telegram.text==='string'&&Boolean(canonical?.analytical_fingerprint)&&telegram.analytical_fingerprint===canonical.analytical_fingerprint?telegram.text:null;
 const telegramReceipts=confirmedBlockContextFacts(canonical).filter(row=>(payload?.includes(`• ${row.label}: ${row.value}`)||payload?.includes(`• ${plainContextFact(row,canonical)}`)||payload?.includes(`• ${omitTelegramCurrencies(plainContextFact(row,canonical))}`))).map(row=>({block_id:row.block_id,evidence_id:row.evidence_id,physical_root_key:row.physical_root_key,source_ts:row.source_ts,observed_ts:row.observed_ts,label:row.label,value:row.value,consumer:'APPROVED_TELEGRAM_PAYLOAD_CONTEXT',score_contribution:0}));
 return{version:BLOCK_RESULT_CONTEXT_VERSION,contract,run_id:canonical?.run_id??null,snapshot_id:canonical?.snapshot_id??null,status:printed?'RENDERED_OUTPUT_VERIFIED':'FORMATTER_OUTPUT_NOT_CONFIRMED',context_receipts:receipts,used_context_block_ids:[...new Set(receipts.map(row=>row.block_id))],available_not_rendered_evidence_ids:available.facts.filter(row=>!receipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_payload_status:payload?'APPROVED_PAYLOAD_TEXT_OBSERVED':'APPROVED_PAYLOAD_NOT_CONFIRMED',telegram_context_receipts:telegramReceipts,telegram_used_context_block_ids:[...new Set(telegramReceipts.map(row=>row.block_id))],telegram_available_not_rendered_evidence_ids:available.facts.filter(row=>!telegramReceipts.some(r=>r.evidence_id===row.evidence_id)).map(row=>row.evidence_id),telegram_delivery_proven:false,telegram_message_id:null,entry_authorized:false,internal_only:true};
}
