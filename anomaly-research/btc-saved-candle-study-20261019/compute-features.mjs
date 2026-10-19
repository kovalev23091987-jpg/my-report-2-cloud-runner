// One saved-data study; imports only the already accepted OFFLINE pure formula.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {features} from '../observer/observer.mjs';
const [inputPath,outputPath,protocolPath]=process.argv.slice(2);
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const bytes=fs.readFileSync(protocolPath),plan=JSON.parse(bytes);
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
const r=plan.fixed_rules;
const assert=(v,why)=>{if(!v)throw Error(why);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const evaluate=(bars,market,timeframe)=>{
 const hits=[];
 for(let n=r.lookback;n<bars.length;n++){
  const candle=bars[n],prior=bars.slice(n-r.lookback,n);
  if(prior.some((v,k)=>v.end_ts>(k===prior.length-1?candle.start_ts:prior[k+1].start_ts)||k&&v.start_ts!==prior[k-1].end_ts)||prior.at(-1).end_ts!==candle.start_ts)continue;
  const internal=b=>({open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.raw_column7_sum)});
  const f=features(internal(candle),prior.map(internal));
  const geometry=f.body_ratio!==null&&(f.body_ratio<=r.small_body||f.upper_wick_ratio>=r.large_wick||f.lower_wick_ratio>=r.large_wick);
  const conjunction=f.volume_ratio!==null&&f.volume_ratio>=r.relative_raw_column7&&geometry;
  if(!conjunction&&!(f.volume_ratio!==null&&f.volume_ratio>=r.extreme_raw_column7))continue;
  const {volume_ratio,volume_median,volume_mad,volume_robust_z,...shape}=f;
  const fields={relative_raw_column7:volume_ratio,raw_column7_median_float:volume_median,raw_column7_mad_float:volume_mad,raw_column7_robust_z:volume_robust_z,...shape};
  const event_id='BTC_SAVED_FIELD_RESEARCH:'+crypto.createHash('sha256').update([market,timeframe,candle.start_ts,digest].join('|')).digest('hex');
  hits.push({event_id,market,symbol:'BTCUSDT',timeframe,discovery:'BACKFILLED',first_known_ts:input.study_first_known_ts,rule_basis:conjunction?'FIELD_RATIO_AND_GEOMETRY':'EXTREME_FIELD_ONLY_NO_CAUSAL_DIRECTION',direction:'UNASSIGNED',quantity_units_verified:false,price_qualification:'HISTORICAL_PRICE_ONLY',production_anomaly_card:false,candle,background:prior,features:fields,hypotheses:['ABSORPTION_POSSIBLE_NOT_PROVEN','DISTRIBUTION_POSSIBLE_NOT_PROVEN','TWO_SIDED_TURNOVER_POSSIBLE','DERIVATIVES_NOISE_POSSIBLE','INSUFFICIENT_CAUSAL_DATA'],entry_authorized:false,main_score_effect:0});
 }
 return hits;
};
const events=[],series=[],prefixChecks=[];
for(const s of input.series){
 const hits=evaluate(s.bars,s.market,s.timeframe);
 // Same actual June prefix with and without later stored months. No future path is consulted.
 const cut=s.bars.findIndex(b=>b.start_ts>=1782864000000);
 const n=cut<0?s.bars.length:cut,prefix=evaluate(s.bars.slice(0,n),s.market,s.timeframe);
 const selected=hits.filter(x=>x.candle.end_ts<=s.bars[n-1]?.end_ts);
 assert(same(prefix,selected),'ACTUAL_JUNE_PREFIX_CHANGED_WITH_FUTURE_'+s.market+'_'+s.timeframe);
 prefixChecks.push({market:s.market,timeframe:s.timeframe,closed_bars:n,candidates:prefix.length,pass:true});
 for(const e of hits){assert(e.background.length===20&&e.background.at(-1).end_ts===e.candle.start_ts,'PRIOR_ONLY_BASELINE');assert(e.first_known_ts>e.candle.end_ts,'BACKFILL_CLOCK');assert(Object.values(e.features).every(x=>x===null||Number.isFinite(x)),'FINITE_FEATURES');}
 events.push(...hits);series.push({market:s.market,timeframe:s.timeframe,complete_closed_bars:s.bars.length,eligible_baseline_windows:Math.max(0,s.bars.length-r.lookback),insufficient_history:s.bars.length<=r.lookback,candidates:hits.length,field_and_geometry:hits.filter(x=>x.rule_basis==='FIELD_RATIO_AND_GEOMETRY').length,extreme_field_only:hits.filter(x=>x.rule_basis==='EXTREME_FIELD_ONLY_NO_CAUSAL_DIRECTION').length});
}
fs.writeFileSync(outputPath,JSON.stringify({protocol_sha256:digest,series,events,prefixChecks})+'\n');
console.log(JSON.stringify({stage:'accepted_offline_features_on_actual_saved_bars',series:series.length,events:events.length,actual_prefix_checks:prefixChecks.length,old_suites_run:0,production_imports:0}));
