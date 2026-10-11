import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {exactGateTokenBinding} from './gate-four-hour-flow.mjs';

export const GATE_FUTURES_TRADE_SAMPLE_VERSION='gate-futures-trade-sample-v1-20261011';
const WINDOW=5*60_000,TTL=60_000;
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const tradeId=x=>typeof x==='string'&&/^\d{1,32}$/.test(x)?x:typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?String(x):null;

// Gate's public futures trade feed uses signed contract size: positive means
// buyer taker, negative means seller taker. A contract is not one base coin;
// quote turnover needs the exact contract's published quanto_multiplier.
export function normalizeGateFuturesTradeSample({contract,identity,currencies,spot,future_contract,trades,observed_ts=Date.now()}={}){
 const root={version:GATE_FUTURES_TRADE_SAMPLE_VERSION,status:'EXACT_GATE_FUTURES_SAMPLE_NOT_CLOSED',evidence:[],summary:null,check_completed:false,network_calls:0,internal_only:true};
 const pair=String(contract||'').replace(/-USDT$/,'')+'_USDT',multiplier=finite(future_contract?.quanto_multiplier);
 if(!exactGateTokenBinding({contract,identity,currencies,spot})||future_contract?.name!==pair||future_contract?.status!=='trading'||future_contract?.in_delisting===true||future_contract?.type!=='direct'||!(multiplier>0)||!Array.isArray(trades)||trades.length>1000||!Number.isSafeInteger(observed_ts))return root;
 const counts=new Map(),accepted=[];let rejected=0;
 for(const row of trades){const id=tradeId(row?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
 for(const row of trades){
  const id=tradeId(row?.id),size=finite(row?.size),price=finite(row?.price),clock=finite(row?.create_time_ms??row?.create_time),ts=clock===null?null:Math.round(clock>=1e12?clock:clock*1000),quote=size===null||price===null?null:Math.abs(size)*multiplier*price;
  if(!id||counts.get(id)!==1||row?.contract!==pair||size===null||size===0||!(price>0)||!(quote>0&&Number.isFinite(quote))||!Number.isSafeInteger(ts)||ts>observed_ts||ts<observed_ts-WINDOW){rejected++;continue;}
  accepted.push({id,source_ts:ts,side:size>0?'buy':'sell',quote});
 }
 const buy=accepted.filter(x=>x.side==='buy').reduce((n,x)=>n+x.quote,0),sell=accepted.filter(x=>x.side==='sell').reduce((n,x)=>n+x.quote,0),total=buy+sell;
 const summary={venue:'GATE',market:'FUTURES',returned_rows:trades.length,valid_recent_rows:accepted.length,rejected_rows:rejected,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,observed_quote_turnover_usdt:total,taker_imbalance:total?(buy-sell)/total:null,quanto_multiplier:multiplier,saturated:trades.length===1000,whole_window_coverage_proven:false,window_start:observed_ts-WINDOW,window_end:accepted.length?Math.max(...accepted.map(x=>x.source_ts)):null};
 if(!accepted.length)return{...root,status:trades.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',summary,check_completed:trades.length===0};
 const latest=accepted.reduce((a,b)=>a.source_ts>b.source_ts?a:b),physical=`GATE_FUTURES_TRADE_SAMPLE:${contract}:${latest.id}`,evidence=buildEvidenceV2({provider_id:'GATE_FUTURES_TRADES',upstream_id:'GATE_OFFICIAL_PUBLIC_FUTURES_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_GATE_FUTURES_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.source_ts,observed_ts,expires_at:Math.min(observed_ts+TTL,latest.source_ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,unit:'USDT',value:total,directional_strength:null,extra:{physical_root_key:physical,venue:'GATE',market:'FUTURES',independent_venue_root:'GATE',exact_asset_binding:true,identity,contract_multiplier:multiplier,valid_recent_rows:accepted.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:summary.taker_imbalance,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false,direction_reference_url:'https://www.gate.com/docs/developers/futures/ws/en/',contract_reference_url:'https://www.gate.com/docs/developers/apiv4/en/futures/'}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',evidence:[evidence],summary,check_completed:true};
}

export function validateGateFuturesTradeSample(row,now){
 const buy=finite(row?.buy_quote_turnover_usdt),sell=finite(row?.sell_quote_turnover_usdt),total=finite(row?.value);
 return row?.block_id==='N12'&&row?.metric_family==='ACTUAL_GATE_FUTURES_TAKER_TRADES_BOUNDED'&&row?.provider_id==='GATE_FUTURES_TRADES'&&row?.upstream_id==='GATE_OFFICIAL_PUBLIC_FUTURES_TRADES'&&row?.venue==='GATE'&&row?.market==='FUTURES'&&row?.independent_venue_root==='GATE'&&row?.exact_asset_binding===true&&row?.identity?.asset_kind==='TOKEN'&&(['ethereum','bsc','arbitrum','base','optimism','polygon','avalanche'].includes(row.identity.chain)?/^0x[0-9a-f]{40}$/i.test(row.identity.contract_or_mint||''):row.identity.chain==='solana'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.identity.contract_or_mint||''))&&row?.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row?.coverage_fraction===0&&row?.whole_window_coverage_proven===false&&row?.score_contribution===0&&row?.entry_authorized===false&&row?.directional_strength===null&&row?.unit==='USDT'&&Number.isSafeInteger(row?.valid_recent_rows)&&row.valid_recent_rows>0&&buy!==null&&sell!==null&&buy>=0&&sell>=0&&total>0&&Math.abs(buy+sell-total)<=Math.max(.000001,total*.000001)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-9&&finite(row?.contract_multiplier)>0&&row?.origin_event_id===row?.physical_root_key&&String(row.origin_event_id).startsWith(`GATE_FUTURES_TRADE_SAMPLE:${row.htx_contract}:`)&&Number.isSafeInteger(row?.source_ts)&&row.source_ts<=now&&now-row.source_ts<=WINDOW&&row.expires_at>now;
}
