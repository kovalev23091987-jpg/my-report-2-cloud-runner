import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
// Exact executed-volume profile. Ready REST snapshots only: no rolling tape,
// database, polling, candle-volume allocation, or cross-venue substitution.
export const VOLUME_PROFILE_VERSION='htx-volume-profile-v1-20260930';
const MINUTE=60000,MAX_AGE=180000,BINS=60;
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-7,Math.max(Math.abs(a),Math.abs(b))*1e-8);
const snapshots=new Map();
const unavailable=reason=>({version:VOLUME_PROFILE_VERSION,status:'NOT_CLOSED',reason,source:'HTX_OFFICIAL',decision_block:'MARKET_STRENGTH_SPOT',score_eligible:false,new_history_accumulated:false});
export function clearVolumeProfileSnapshots(){snapshots.clear();}
export function observeHtxVolumeSnapshot(payload,url,received_at=Date.now()){
 const u=new URL(url);if(u.hostname!=='api.hbdm.com'||payload?.status!=='ok')return;
 const contract=u.searchParams.get('contract_code');if(!isExactHtxUsdtSwapKey(contract||''))return;
 const kind=u.pathname==='/linear-swap-api/v1/swap_contract_info'?'info':u.pathname==='/linear-swap-ex/market/history/trade'?'trades':u.pathname==='/linear-swap-ex/market/history/kline'&&u.searchParams.get('period')==='1min'?'candles':null;
 if(!kind)return;
 // Replace the entire endpoint snapshot; NEVER merge successive responses.
 if(!snapshots.has(contract)&&snapshots.size>=8)snapshots.delete(snapshots.keys().next().value);
 const old=snapshots.get(contract)||{};snapshots.set(contract,{...old,[kind]:{payload,received_at}});
}
export function buildHtxVolumeProfile({contract,trades,candles,info,now=Date.now(),window_minutes=null,window_end=null}={}){
 if(!isExactHtxUsdtSwapKey(contract||''))return unavailable('EXACT_CONTRACT_REQUIRED');
 if(trades?.status!=='ok'||candles?.status!=='ok'||info?.status!=='ok'||trades.ch!==`market.${contract}.trade.detail`||candles.ch!==`market.${contract}.kline.1min`)return unavailable('EXACT_HTX_CHANNELS_REQUIRED');
 if(![trades,candles,info].every(p=>finite(p.ts)!==null&&p.ts<=now&&now-p.ts<=MAX_AGE))return unavailable('FRESH_SOURCE_TIMESTAMPS_REQUIRED');
 const metadata=(Array.isArray(info.data)?info.data:[]).filter(r=>r.contract_code===contract);
 if(metadata.length!==1||metadata[0].contract_status!==1||!(finite(metadata[0].contract_size)>0&&finite(metadata[0].price_tick)>0))return unavailable('ACTIVE_CONTRACT_UNITS_REQUIRED');
 const contractSize=Number(metadata[0].contract_size),tick=Number(metadata[0].price_tick);
 const end=window_end??Math.floor(Math.min(trades.ts,candles.ts,now)/MINUTE)*MINUTE;
 if(!Number.isSafeInteger(end)||end%MINUTE||end>now||now-end>MAX_AGE)return unavailable('CLOSED_FRESH_WINDOW_REQUIRED');
 const minutes=window_minutes===null?[240,60,15]:[window_minutes];
 if(minutes.some(n=>![240,60,15].includes(n)))return unavailable('APPROVED_WINDOW_REQUIRED');
 if(!Array.isArray(trades.data)||!trades.data.every(x=>Array.isArray(x?.data))||!Array.isArray(candles.data))return unavailable('SNAPSHOT_SCHEMA_REQUIRED');
 const raw=trades.data.flatMap(x=>x.data);
 if(raw.some(r=>finite(r?.ts)===null))return unavailable('TRADE_TIME_REQUIRED');
 const rejected=[];
 for(const duration of minutes){
  const start=end-duration*MINUTE,rows=raw.filter(r=>r.ts>=start&&r.ts<end),bars=candles.data.filter(r=>finite(r?.id)!==null&&r.id*1000>=start&&r.id*1000<end).sort((a,b)=>a.id-b.id);
  if(bars.length!==duration||!bars.every((b,i)=>b.id*1000===start+i*MINUTE)){rejected.push({duration,reason:'CONTIGUOUS_MINUTES_REQUIRED'});continue;}
  const seen=new Set(),byMinute=new Map();let bad=false;
  for(const r of rows){
   const id=typeof r.id==='string'?r.id:typeof r.id==='number'&&Number.isSafeInteger(r.id)?String(r.id):'';
   const p=finite(r.price),n=finite(r.amount),q=finite(r.quantity),v=finite(r.trade_turnover);
   if(!/^\d{1,32}$/.test(id)||seen.has(id)||!Number.isSafeInteger(r.ts)||!Number.isSafeInteger(n)||!(p>0&&n>0&&q>0&&v>0)||!['buy','sell'].includes(r.direction)||!close(q,n*contractSize)||!close(v,p*q)){bad=true;break;}
   seen.add(id);const t=Math.floor(r.ts/MINUTE)*MINUTE,a=byMinute.get(t)||{count:0,contracts:0,base:0,quote:0,low:Infinity,high:-Infinity};
   a.count++;a.contracts+=n;a.base+=q;a.quote+=v;a.low=Math.min(a.low,p);a.high=Math.max(a.high,p);byMinute.set(t,a);
  }
  if(bad){rejected.push({duration,reason:'EXACT_UNIQUE_TRADES_AND_UNITS_REQUIRED'});continue;}
  for(const b of bars){
   const a=byMinute.get(b.id*1000)||{count:0,contracts:0,base:0,quote:0};
   if(!['open','high','low','close'].every(k=>finite(b[k])>0)||b.low>b.high||b.open<b.low||b.open>b.high||b.close<b.low||b.close>b.high||!Number.isSafeInteger(b.count)||!['vol','amount','trade_turnover'].every(k=>finite(b[k])!==null&&b[k]>=0)||a.count!==b.count||!close(a.contracts,b.vol)||!close(a.base,b.amount)||!close(a.quote,b.trade_turnover)||(a.count>0&&(!close(a.low,b.low)||!close(a.high,b.high)))){bad=true;break;}
  }
  if(bad||rows.length<20){rejected.push({duration,reason:bad?'MINUTE_RECONCILIATION_FAILED':'MINIMUM_TWENTY_TRADES_REQUIRED'});continue;}
  const low=Math.min(...rows.map(r=>r.price)),high=Math.max(...rows.map(r=>r.price));
  if(high-low<tick){rejected.push({duration,reason:'NON_FLAT_PRICE_RANGE_REQUIRED'});continue;}
  const count=Math.min(BINS,Math.max(1,Math.floor((high-low)/tick))),width=(high-low)/count,volumes=Array(count).fill(0);
  for(const r of rows)volumes[Math.min(count-1,Math.floor((r.price-low)/width))]+=r.quantity;
  const total=rows.reduce((a,r)=>a+r.quantity,0),sum=volumes.reduce((a,b)=>a+b,0);
  if(!close(total,sum))return unavailable('VOLUME_CONSERVATION_FAILED');
  const peak=Math.max(...volumes),pocIndex=volumes.indexOf(peak);let left=pocIndex,right=pocIndex,area=peak;
  while(area<total*.7&&(left>0||right<count-1))if(right<count-1&&(left===0||volumes[right+1]>=volumes[left-1]))area+=volumes[++right];else area+=volumes[--left];
  return {version:VOLUME_PROFILE_VERSION,status:'CLOSED',source:'HTX_OFFICIAL',market:'HTX_LINEAR_USDT_PERPETUAL',contract,decision_block:'MARKET_STRENGTH_SPOT',method:'EXACT_TRADES_MINUTE_RECONCILED',window_start:start,window_end:end,window_minutes:duration,source_ts:Math.min(trades.ts,candles.ts,info.ts),observed_ts:now,expires_at:Math.min(end+MAX_AGE,trades.ts+MAX_AGE,candles.ts+MAX_AGE,info.ts+MAX_AGE),coverage_fraction:1,minutes_reconciled:duration,unique_trades:rows.length,volume_unit:contract.replace('-USDT',''),total_base_volume:total,price_low:low,price_high:high,bin_count:count,bin_width:width,volume_by_price_bin:volumes,poc:low+(pocIndex+.5)*width,val:low+left*width,vah:low+(right+1)*width,value_area_fraction:area/total,poc_tie_rule:'LOWEST_PRICE_BIN',value_area_rule:'CONTIGUOUS_70_PERCENT_LARGER_ADJACENT_TIE_HIGH',last_closed_bars:bars.slice(-3).map(b=>({ts:b.id*1000,open:b.open,high:b.high,low:b.low,close:b.close,base_volume:b.amount})),score_eligible:true,maximum_score_points:duration===240?1.5:duration===60?1:.5,profitability_proven:false,new_history_accumulated:false,fallback_reasons:rejected};
 }
 return {...unavailable('NO_COMPLETE_READY_WINDOW'),fallback_reasons:rejected};
}
export function readReadyHtxVolumeProfile({contract,now=Date.now(),window_minutes=null,window_end=null}={}){
 const s=snapshots.get(contract);if(!s||!['trades','candles','info'].every(k=>s[k]&&s[k].received_at<=now&&now-s[k].received_at<=MAX_AGE))return unavailable('READY_SNAPSHOTS_REQUIRED');
 return buildHtxVolumeProfile({contract,now,window_minutes,window_end,trades:s.trades.payload,candles:s.candles.payload,info:s.info.payload});
}
export function volumeProfileSignal(profile,{contract,now=Date.now(),reference_price,direction}={}){
 const p=profile,price=finite(reference_price),bars=p?.last_closed_bars;
 if(p?.version!==VOLUME_PROFILE_VERSION||p.status!=='CLOSED'||p.contract!==contract||p.method!=='EXACT_TRADES_MINUTE_RECONCILED'||p.coverage_fraction!==1||p.score_eligible!==true||![now,p.window_start,p.window_end,p.observed_ts,p.expires_at].every(v=>finite(v)!==null)||p.window_end-p.window_start!==p.window_minutes*MINUTE||p.window_end>now||p.observed_ts>now||p.expires_at<now||now-p.window_end>MAX_AGE||!(price>0)||!Array.isArray(bars)||bars.length!==3||![p.val,p.poc,p.vah,p.bin_width].every(v=>finite(v)>0)||p.val>p.poc||p.poc>p.vah)return {status:'NOT_CLOSED',signed_strength:0,reason:'FRESH_EXACT_PROFILE_REQUIRED'};
 const [a,b,c]=bars;if(!bars.every((r,i)=>r.ts===p.window_end-(3-i)*MINUTE))return {status:'NOT_CLOSED',signed_strength:0,reason:'CONFIRMING_BARS_REQUIRED'};
 // Two closed closes confirm acceptance; a POC recapture/loss also needs the
 // prior close on the opposite side. Distance guard prevents chasing a gap.
 const range=Math.max(p.vah-p.val,p.bin_width),maxDeviation=Math.max(.005,Math.min(.03,range/c.close));
 if(Math.abs(price/c.close-1)>maxDeviation)return {status:'NOT_CLOSED',signed_strength:0,reason:'CURRENT_PRICE_DIVERGED'};
 let bull=0,reason='INSIDE_VALUE_AREA_NEUTRAL';
 const activeConfirmation=finite(b.base_volume)>0&&finite(c.base_volume)>0;
 if(!activeConfirmation)return {status:'CLOSED',bullish_strength:0,signed_strength:0,maximum_score_points:p.window_minutes===240?1.5:p.window_minutes===60?1:.5,reason:'TWO_ACTIVE_CLOSED_MINUTES_REQUIRED',empirical_profitability_claim:false};
 if(b.close>p.vah&&c.close>p.vah&&price>p.vah&&price<=p.vah+range){bull=1;reason='ACCEPTANCE_ABOVE_VALUE_AREA';}
 else if(b.close<p.val&&c.close<p.val&&price<p.val&&price>=p.val-range){bull=-1;reason='ACCEPTANCE_BELOW_VALUE_AREA';}
 else if(a.close<=p.poc&&b.close>p.poc&&c.close>p.poc&&price>p.poc){bull=.5;reason='POC_RECAPTURE_TWO_CLOSED_MINUTES';}
 else if(a.close>=p.poc&&b.close<p.poc&&c.close<p.poc&&price<p.poc){bull=-.5;reason='POC_LOSS_TWO_CLOSED_MINUTES';}
 const cap=p.window_minutes===240?1.5:p.window_minutes===60?1:p.window_minutes===15?.5:0;
 return {status:'CLOSED',bullish_strength:bull,signed_strength:direction==='LONG'?bull:direction==='SHORT'?-bull:0,maximum_score_points:cap,reason,empirical_profitability_claim:false};
}
export function volumeProfileScoreEvidence(profile,options={}){
 const s=volumeProfileSignal(profile,options);if(s.status!=='CLOSED'||!s.signed_strength||!s.maximum_score_points)return null;
 return {source_id:'HTX_VOLUME_PROFILE',responsibility_group:'EXECUTED_VOLUME_ACCEPTANCE',decision_chain:'MARKET_STRENGTH_SPOT',signed_strength:s.signed_strength,quality:s.maximum_score_points/3,maximum_score_points:s.maximum_score_points,asset_identity:profile.contract,metric_family:'EXACT_VOLUME_PROFILE_ACCEPTANCE',provider_object_id:`${profile.contract}:${profile.window_start}:${profile.window_end}`,physical_root_key:`HTX_VOLUME_PROFILE|${profile.contract}|${profile.window_start}|${profile.window_end}`,fresh:true,exact_identity:true,signal_reason:s.reason,window_minutes:profile.window_minutes,profitability_proven:false};
}
export function volumeProfileFacts(profile,options={}){
 const s=volumeProfileSignal(profile,options);if(s.status!=='CLOSED')return[];
 const fmt=v=>Number(v.toPrecision(8)),impact=Number((s.signed_strength*s.maximum_score_points).toFixed(2));
 return [{source:'HTX',label:`Боковой объём HTX, ${profile.window_minutes}м`,value:`POC ${fmt(profile.poc)}; VA ${fmt(profile.val)}–${fmt(profile.vah)} USDT`,unit:''},{source:'HTX',label:'Вклад профиля до общего ограничения блока',value:impact,unit:'балла'}];
}
export function applyVolumeProfileToLiquidationPanel(panel,profile,{contract,now=Date.now(),reference_price,consensus_factor=.5}={}){
 const signal=volumeProfileSignal(profile,{contract,now,reference_price});if(signal.status!=='CLOSED')return {...panel,volume_profile_status:profile?.reason||'NOT_CLOSED'};
 const levels=[['POC',profile.poc],['VAL',profile.val],['VAH',profile.vah]];
 const clusters=(panel.clusters||[]).map(c=>{const nearby=consensus_factor>0?levels.filter(([,p])=>Math.abs(c.center_price/p-1)<=.003).map(([name,price])=>({name,price})):[];return {...c,volume_profile_confluence:nearby,volume_profile_priority_bonus:nearby.length?5*consensus_factor:0,volume_profile_additional_score_points:0};});
 clusters.sort((a,b)=>b.volume_profile_priority_bonus-a.volume_profile_priority_bonus||Math.abs(a.distance_pct)-Math.abs(b.distance_pct));
 return {...panel,clusters,volume_profile_status:'CLOSED',volume_profile:profile,volume_profile_score_owner:'MARKET_STRENGTH_SPOT_ONLY',volume_profile_does_not_prove_liquidation:true};
}
