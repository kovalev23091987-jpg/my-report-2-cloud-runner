import {buildEvidenceV2} from './evidence-source-adapters.mjs';

const WINDOW=5*60_000,TTL=60_000,LIMIT=2000;
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const id=v=>typeof v==='string'&&/^\d{1,32}$/.test(v)?v:typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):null;
const sample=r=>r?.evidence?.find(e=>e.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE');

export function normalizeHtxSpotTradeSample(payload,{contract,observed_ts=Date.now()}={}){
 const symbol=String(contract||'').replace(/-USDT$/,'').toLowerCase()+'usdt';
 if(!/^[^-\s]{1,32}-USDT$/.test(contract)||payload?.status!=='ok'||payload?.ch!==`market.${symbol}.trade.detail`||!Array.isArray(payload?.data)||finite(payload.ts)===null||payload.ts>observed_ts||observed_ts-payload.ts>TTL)return{status:'EXACT_FRESH_HTX_SPOT_TRADES_REQUIRED',evidence:[],summary:null};
 const rows=payload.data.flatMap(batch=>Array.isArray(batch?.data)?batch.data:[]),counts=new Map();
 for(const row of rows){const tradeId=id(row?.['trade-id']??row?.id);if(tradeId)counts.set(tradeId,(counts.get(tradeId)||0)+1);}
 const accepted=[];let rejected=0;
 for(const row of rows){const tradeId=id(row?.['trade-id']??row?.id),price=finite(row?.price),amount=finite(row?.amount),ts=finite(row?.ts);if(!tradeId||counts.get(tradeId)!==1||!(price>0&&amount>0)||!['buy','sell'].includes(row?.direction)||!(ts<=payload.ts&&ts<=observed_ts&&ts>=observed_ts-WINDOW)){rejected++;continue;}accepted.push({trade_id:tradeId,ts,quote:price*amount,side:row.direction});}
 const buy=accepted.filter(r=>r.side==='buy').reduce((n,r)=>n+r.quote,0),sell=accepted.filter(r=>r.side==='sell').reduce((n,r)=>n+r.quote,0),total=buy+sell,span=accepted.length>1?Math.max(...accepted.map(r=>r.ts))-Math.min(...accepted.map(r=>r.ts)):0,saturated=payload.data.length>=LIMIT||rows.length>=LIMIT,coverage=accepted.length?Math.min(saturated?.1:.25,Math.max(saturated?.02:.05,(span/WINDOW)*(saturated?.1:1))):0,imbalance=total?(buy-sell)/total:0;
 const summary={market:'SPOT',rows_returned:rows.length,valid_recent_rows:accepted.length,rejected_rows:rejected,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,observed_quote_turnover_usdt:total,taker_imbalance:imbalance,sample_coverage_fraction:coverage,saturated,whole_window_coverage_proven:false,window_start:observed_ts-WINDOW,window_end:payload.ts};
 if(!accepted.length)return{status:rows.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',evidence:[],summary};
 const last=accepted.reduce((a,b)=>a.ts>b.ts?a:b),root=`HTX_SPOT_TRADE_SAMPLE:${contract}:${last.trade_id}`;
 const evidence=[buildEvidenceV2({provider_id:'HTX_SPOT_TRADES',upstream_id:'HTX_PUBLIC_SPOT_TRADES',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE',origin_event_id:root,dependency_group:root,source_ts:last.ts,observed_ts,expires_at:Math.min(observed_ts+TTL,last.ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:coverage,directional_strength:imbalance,unit:'USDT',value:total,extra:{market:'SPOT',physical_root_key:root,valid_recent_rows:accepted.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,whole_window_coverage_proven:false,entry_eligible:false,is_htx_price:false,htx_execution_target_eligible:false,direction_policy:'TAKER_IMBALANCE_LOW_WEIGHT_BOUNDED_SAMPLE'}})];
 return{status:'CLOSED_BOUNDED_SAMPLE',evidence,summary};
}

export function reconcileN12HtxMarkets({contract,futures,spot_payload,observed_ts=Date.now()}={}){
 const spot=spot_payload?normalizeHtxSpotTradeSample(spot_payload,{contract,observed_ts}):{status:'SPOT_RESPONSE_UNAVAILABLE',evidence:[],summary:null},f=sample(futures),s=sample(spot);
 const evidence=[...(futures?.evidence||[]).filter(row=>row!==f),...(spot.evidence||[]).filter(row=>row!==s)];let agreement=null;
 if(f&&s){
  const fi=Number(f.directional_strength),si=Number(s.directional_strength);
  agreement=Math.abs(fi)>=.05&&Math.abs(si)>=.05&&Math.sign(fi)===Math.sign(si)&&Math.abs(Math.abs(fi)-Math.abs(si))<=.15;
  const root=`HTX_SPOT_FUTURES_TRADE_SAMPLE:${contract}:${f.origin_event_id}:${s.origin_event_id}`,source_ts=Math.min(f.source_ts,s.source_ts),direction=agreement?Math.sign(fi)*Math.min(Math.abs(fi),Math.abs(si)):null;
  evidence.push(buildEvidenceV2({provider_id:'HTX_SPOT_FUTURES_TRADES',upstream_id:'HTX_OFFICIAL_SPOT_AND_FUTURES_RAW_FILLS',asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_TAKER_TRADES_BOUNDED_MULTI_MARKET',origin_event_id:root,dependency_group:root,source_ts,observed_ts,expires_at:Math.min(f.expires_at,s.expires_at),coverage_status:agreement?'BOUNDED_MULTIMARKET_AGREEMENT':'BOUNDED_MULTIMARKET_DISAGREEMENT',coverage_fraction:agreement?Math.min(f.coverage_fraction,s.coverage_fraction):0,directional_strength:direction,unit:'RATIO',value:direction,extra:{physical_root_key:root,components:[{venue:'HTX',market:'FUTURES',buy_quote_turnover_usdt:f.buy_quote_turnover_usdt,sell_quote_turnover_usdt:f.sell_quote_turnover_usdt,valid_recent_rows:f.valid_recent_rows,imbalance:fi,source_ts:f.source_ts},{venue:'HTX',market:'SPOT',buy_quote_turnover_usdt:s.buy_quote_turnover_usdt,sell_quote_turnover_usdt:s.sell_quote_turnover_usdt,valid_recent_rows:s.valid_recent_rows,imbalance:si,source_ts:s.source_ts}],independent_venue_count:1,whole_window_coverage_proven:false,entry_eligible:false,is_htx_price:false,htx_execution_target_eligible:false,agreement_policy:'SAME_SIGN_ABS_IMBALANCE_GTE_0_05_ABS_STRENGTH_SPREAD_LTE_0_15'}}));
 }else evidence.push(...(f?[f]:[]),...(s?[s]:[]));
 const checked=[futures,spot].some(r=>String(r?.status||'').startsWith('CLOSED'));
 return{status:f&&s?(agreement?'CLOSED_BOUNDED_MULTIMARKET_AGREEMENT':'CLOSED_BOUNDED_MULTIMARKET_DISAGREEMENT'):checked?'CLOSED_BOUNDED_PARTIAL_MARKET':'EXACT_FRESH_TRADE_BATCH_REQUIRED',evidence,summary:{futures:futures?.summary||null,spot:spot.summary,agreement,independent_venue_count:checked?1:0},receipts:[{route:'HTX_FUTURES_SAME_RUN',status:futures?.status||'UNAVAILABLE'},{route:'HTX_SPOT_SAME_RUN',status:spot.status}],network_calls:0,check_completed:checked,cache_status:'SAME_RUN_REUSED',internal_only:true};
}
