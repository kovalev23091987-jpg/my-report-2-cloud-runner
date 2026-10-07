import {BLOCKS,validateEvidenceV2} from './evidence-v2.mjs';
import {BLOCK_WEIGHT_VERSION,INITIAL_BLOCK_CAPS,NON_ADAPTIVE_BLOCKS,blockPolicyDigest,validBlockWeightPolicy} from './block-score-policy.mjs';
import {readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
import {digest} from './upstream-proof-utils.mjs';

const DAY=86400000,HORIZON=4*3600000,WEEK=7*DAY,SOURCE='BLOCK_WEIGHT_STATISTICS',KEY='CURRENT_POLICY_V1';
const ids=Object.keys(BLOCKS).filter(id=>!NON_ADAPTIVE_BLOCKS.includes(id)),array=v=>Array.isArray(v)?v:[],num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const stamp=v=>Number.isSafeInteger(v)&&v>=1e12,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const BLOCK_WEIGHT_STATS_BUDGET=Object.freeze({rows_read:8000,rows_written:4,source_http:0,max_joined_rows:2400});

// Store ex-ante attribution on the EXISTING prospective sample. An observation,
// raw source count or a later reconstructed receipt is never a trade outcome.
export function captureBlockWeightAttribution(c={}){
 const contract=c.metadata?.contract,ts=c.observed_ts,score=c.metadata?.supplemental_score_adjustment;
 if(!contract||!stamp(ts)||!['LONG','SHORT'].includes(c.direction)||score?.status!=='CLOSED'||num(score.base_score)===null)return null;
 const evidence=array(c.metadata?.internal_market_context?.evidence_v2?.evidence),features={},observed={};
 for(const id of ids){
  const rows=evidence.filter(r=>r.htx_contract===contract&&r.block_id===id&&validateEvidenceV2(r,{decision_ts:ts}).usable&&r.coverage_fraction>=.5&&Number(r.reliability??.8)>=.7);
  const usable=array(score.receipts).filter(r=>r.source_id==='EVIDENCE_V2'&&r.fresh===true&&r.exact_identity===true&&num(r.score_contribution)!==null&&r.score_contribution!==0&&rows.some(e=>e.evidence_id===r.provider_object_id)&&array(r.evidence_v2_receipts).some(e=>e.evidence_id===r.provider_object_id&&e.block_id===id&&e.reason==='CONSUMED'));
  observed[id]=usable.length>0;
  // Normalize the ACTUALLY applied contribution by its admitted cap/factor;
  // adaptation cannot create a sign, reward a neutral row or learn from itself.
  features[id]=clamp(usable.reduce((s,r)=>s+r.score_contribution/(r.block_weight?.cap||BLOCKS[id].cap),0),-1,1);
 }
 const costs=c.costs;
 const cost=costs?.status==='CLOSED'&&costs.double_count_free===true&&num(costs.total_cost_usdt)!==null&&costs.total_cost_usdt>=0&&num(costs.entry_notional_usdt)>0&&stamp(costs.holding_entry_ts)&&stamp(costs.holding_exit_ts)&&costs.holding_entry_ts<=ts&&costs.holding_exit_ts>=ts+HORIZON
  ?{status:'CLOSED_CONSERVATIVE_ANALYTICAL_COST_RESERVE',cost_pct:100*costs.total_cost_usdt/costs.entry_notional_usdt,holding_entry_ts:costs.holding_entry_ts,holding_exit_ts:costs.holding_exit_ts,fee_receipt_id:costs.fee_schedule_receipt_id,holding_receipt_id:costs.holding_plan_receipt_id,actual_executed_profit:false}:null;
 const body={schema:'BLOCK_EX_ANTE_ATTRIBUTION_V1',contract,direction:c.direction,observed_ts:ts,run_id:c.run_id,snapshot_id:c.snapshot_id,base_score:score.base_score,weight_version:BLOCK_WEIGHT_VERSION,features,observed,cost,evidence_ids:[...new Set(array(score.receipts).filter(r=>r.source_id==='EVIDENCE_V2'&&r.score_contribution!==0).map(r=>r.provider_object_id))],score_or_entry_changed:false};
 return {...body,fingerprint:blockPolicyDigest(body)};
}
export function normalizeBlockCalibrationRows(joined=[],now){
 const rows=[];
 for(const row of array(joined).slice(0,BLOCK_WEIGHT_STATS_BUDGET.max_joined_rows)){
  let s,o;try{s=typeof row.sample_json==='string'?JSON.parse(row.sample_json):row.sample;o=typeof row.outcome_json==='string'?JSON.parse(row.outcome_json):row.outcome;}catch{continue;}
  const a=s?.block_weight_attribution,b=o?.block_weight_outcome_basis;
  if(!a||!b||num(a.base_score)===null||a.base_score<0||a.base_score>100||!stamp(a.cost?.holding_entry_ts)||!stamp(a.cost?.holding_exit_ts)||a.cost.holding_entry_ts>a.observed_ts||!a.cost.fee_receipt_id||!a.cost.holding_receipt_id||a.schema!=='BLOCK_EX_ANTE_ATTRIBUTION_V1'||!a.cost||a.cost.status!=='CLOSED_CONSERVATIVE_ANALYTICAL_COST_RESERVE'||num(a.cost.cost_pct)===null||a.cost.cost_pct<0||a.cost.actual_executed_profit!==false||!stamp(a.observed_ts)||a.observed_ts!==s.observed_ts||a.contract!==s.contract_code||a.direction!==s.direction||a.snapshot_id!==s.snapshot_id||s.approved_entry_only!==true||s.one_wave_one_outcome!==true||!s.outcome_wave_key||!['LONG','SHORT'].includes(s.direction)||o.horizon_hours!==4||o.observed_ts!==a.observed_ts||o.contract_code!==a.contract||o.direction!==a.direction||!stamp(o.computed_ts)||o.computed_ts>now||!stamp(o.outcome_scan_ts)||o.outcome_scan_ts<a.observed_ts+HORIZON||o.outcome_scan_ts>a.observed_ts+HORIZON+900000||b.source!=='HTX_PUBLIC_HISTORY_FACTUAL_NO_INTERPOLATION'||b.interpolation_used!==false||num(b.path_coverage_pct)===null||b.path_coverage_pct<95||num(o.directional_return_pct)===null||a.cost.holding_exit_ts<o.outcome_scan_ts)continue;
  const {fingerprint,...body}=a;if(fingerprint!==blockPolicyDigest(body))continue;
  if(row.sample_digest&&row.sample_digest!==digest(s)||row.outcome_digest&&row.outcome_digest!==digest(o))continue;
  if(ids.some(id=>num(a.features?.[id])===null||Math.abs(a.features[id])>1||typeof a.observed?.[id]!=='boolean'))continue;
  rows.push({asset:a.contract,wave:s.outcome_wave_key,observed_ts:a.observed_ts,end_ts:o.outcome_scan_ts,direction:a.direction,base_score:a.base_score,features:a.features,observed:a.observed,net_forward_return_pct:clamp(o.directional_return_pct-a.cost.cost_pct,-10,10),input_fingerprint:blockPolicyDigest({sample:s,outcome:o}),analytical_cost_reserve:true,executed_trade_profit:false});
 }
 // First ex-ante record per wave, and non-overlapping4h windows per asset.
 const waves=new Set(),lastEnd=new Map(),unique=[];
 for(const r of rows.sort((a,b)=>a.observed_ts-b.observed_ts||a.input_fingerprint.localeCompare(b.input_fingerprint))){const key=`${r.asset}|${r.wave}`;if(waves.has(key)||r.observed_ts<(lastEnd.get(r.asset)||0))continue;waves.add(key);lastEnd.set(r.asset,r.end_ts);unique.push(r);}
 return unique;
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const variance=a=>{const m=mean(a);return a.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,a.length-1);};
const features=(r,excluded)=>[1,(r.base_score-70)/30,...ids.filter(id=>id!==excluded).map(id=>r.features[id])];
function fit(rows,excluded){
 const n=features(rows[0],excluded).length,a=Array.from({length:n},()=>Array(n+1).fill(0));
 for(const r of rows){const x=features(r,excluded),y=r.net_forward_return_pct;for(let i=0;i<n;i++){for(let j=0;j<n;j++)a[i][j]+=x[i]*x[j];a[i][n]+=x[i]*y;}}
 // Fixed ridge; no coefficient/horizon/asset search against the test set.
 for(let i=1;i<n;i++)a[i][i]+=Math.max(1,rows.length*.1);
 for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[i],a[p]]=[a[p],a[i]];if(Math.abs(a[i][i])<1e-10)return null;const v=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=v;for(let j=0;j<n;j++)if(j!==i){const f=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=f*a[i][k];}}
 return a.map(r=>r[n]);
}
const predict=(model,r,id)=>clamp(features(r,id).reduce((s,x,i)=>s+x*model[i],0),-10,10);
function pairedLoss(rows,full,reduced,id){
 const deltas=rows.map(r=>(r.net_forward_return_pct-predict(reduced,r,id))**2-(r.net_forward_return_pct-predict(full,r))**2);
 const m=mean(deltas),se=Math.sqrt(variance(deltas)/deltas.length);
 // Conservative fixed bound for the11 simultaneous block comparisons. No
 // winner chosen by searching many weights on the later validation/test rows.
 return {count:rows.length,mean_squared_error_gain:m,lower_bound:m-3.3*se,upper_bound:m+3.3*se};
}
export function deriveWeeklyBlockWeightPolicy(joined,{now=Date.now(),previous=null}={}){
 const rows=normalizeBlockCalibrationRows(joined,now),n=rows.length,a=Math.floor(n*.6),b=Math.floor(n*.8),boundary1=rows[a]?.observed_ts,boundary2=rows[b]?.observed_ts;
 const train=rows.slice(0,a).filter(r=>r.end_ts+DAY<boundary1),validation=rows.slice(a,b).filter(r=>r.observed_ts>boundary1+DAY&&r.end_ts+DAY<boundary2),test=rows.slice(b).filter(r=>r.observed_ts>boundary2+DAY&&r.observed_ts>(previous?.last_test_end_ts||0));
 const blocks={},ready=train.length>=80&&validation.length>=40&&test.length>=40,model=ready?fit(train):null;
 for(const id of ids){
  const present=rows.filter(r=>r.observed[id]),days=new Set(present.map(r=>new Date(r.observed_ts).toISOString().slice(0,10))).size,assets=new Set(present.map(r=>r.asset)).size,long=present.filter(r=>r.direction==='LONG').length,short=present.length-long;
  const prior=validBlockWeightPolicy(previous,now)?previous.blocks?.[id]?.factor??1:1;
  let entry={factor:prior,status:'INSUFFICIENT_INDEPENDENT_LATER_SAMPLE',independent_samples:present.length,calendar_days:days,assets,long,short,validation_count:validation.filter(r=>r.observed[id]).length,test_count:test.filter(r=>r.observed[id]).length};
  if(model&&present.length>=200&&days>=30&&assets>=20&&long>=50&&short>=50&&entry.validation_count>=40&&entry.test_count>=40&&variance(train.filter(r=>r.observed[id]).map(r=>r.features[id]))>=.0025){
   const reduced=fit(train,id),v=pairedLoss(validation.filter(r=>r.observed[id]),model,reduced,id),t=pairedLoss(test.filter(r=>r.observed[id]),model,reduced,id),coefficient=model[2+ids.indexOf(id)];
   // Test the predeclared sign; never invert a feature to fit one lucky period.
   const up=coefficient>0&&v.lower_bound>0&&t.lower_bound>0,down=(v.upper_bound<0&&t.upper_bound<0)||(coefficient<0&&v.lower_bound>0&&t.lower_bound>0);
   entry={...entry,validation:v,test:t,coefficient,last_validated_ts:up||down?now:previous?.blocks?.[id]?.last_validated_ts,validation_confidence_closed:up||down,test_confidence_closed:up||down,status:up||down?'VALIDATED_LATER_SAMPLE_PREDICTIVE_ASSOCIATION':'NO_STABLE_INCREMENTAL_PREDICTIVE_GAIN',factor:up?Math.min(1.25,prior*1.1):down?Math.max(.75,prior*.9):prior};
  }
  // A previously active factor remains bounded and retains its prior proof
  // while no independent new test is available. Expired policies revert to1.
  if(entry.factor!==1&&entry.status!=='VALIDATED_LATER_SAMPLE_PREDICTIVE_ASSOCIATION')entry={...previous.blocks[id],next_assessment:entry,status:'VALIDATED_LATER_SAMPLE_PREDICTIVE_ASSOCIATION'};
  blocks[id]=entry;
 }
 const body={schema:'BLOCK_PREDICTIVE_WEIGHT_POLICY_V1',weight_version:BLOCK_WEIGHT_VERSION,generated_ts:now,expires_ts:now+8*DAY,weekly_bucket:Math.floor(now/WEEK),last_test_end_ts:ready&&test.length?Math.max(previous?.last_test_end_ts||0,...test.map(r=>r.end_ts)):previous?.last_test_end_ts||0,blocks,input_fingerprint:blockPolicyDigest(rows.map(r=>r.input_fingerprint)),independent_samples:n,method:'FIXED_RIDGE_NET_4H_ANALYTICAL_RETURN_PAIRED_BLOCK_ABLATION_60_20_20_24H_EMBARGO',initial_caps_empirically_validated:false,analytical_cost_reserve_not_executed_profit:true,sourceHTTP:0,family_caps_changed:false,threshold_or_entry_rules_changed:false};
 return {...body,fingerprint:blockPolicyDigest(body)};
}
export async function loadBlockWeightPolicy(db,{now=Date.now(),admit}={}){
 if(admit?.({rows_read:4,rows_written:0})?.allowed!==true)return null;
 try{const p=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:KEY,now});return validBlockWeightPolicy(p,now)?p:null;}catch{return null;}
}
export async function refreshWeeklyBlockWeightPolicy(db,{now=Date.now(),admit}={}){
 if(admit?.({rows_read:4,rows_written:0})?.allowed!==true)return{status:'BLOCK_STATS_BUDGET_DEFERRED',sourceHTTP:0};
 try{
  const previous=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:KEY,now});
  if(validBlockWeightPolicy(previous,now)&&previous.weekly_bucket===Math.floor(now/WEEK))return{status:'WEEKLY_POLICY_ALREADY_ASSESSED',sourceHTTP:0,policy_fingerprint:previous.fingerprint};
  if(admit?.(BLOCK_WEIGHT_STATS_BUDGET)?.allowed!==true)return{status:'BLOCK_STATS_BUDGET_DEFERRED',sourceHTTP:0};
  // Bound the physical outcome scan BEFORE filters/sorting/join. LIMIT after
  // a JSON predicate would still scan the entire historical outcome table.
  const q=await db.prepare(`WITH bounded AS MATERIALIZED (SELECT sample_id,horizon_hours,outcome_json,material_digest,calibration_only,live_promotion_allowed,computed_ts FROM tz101_entry_area_calibration_outcome ORDER BY rowid DESC LIMIT ${BLOCK_WEIGHT_STATS_BUDGET.max_joined_rows}) SELECT s.sample_json,s.material_digest AS sample_digest,o.outcome_json,o.material_digest AS outcome_digest FROM bounded o JOIN tz101_entry_area_calibration_signal s ON s.sample_id=o.sample_id WHERE o.horizon_hours=4 AND o.calibration_only=1 AND o.live_promotion_allowed=0 AND s.calibration_only=1 AND s.live_promotion_allowed=0 AND json_type(s.sample_json,'$.block_weight_attribution')='object' AND o.computed_ts<=?1 AND s.observed_ts>=?2`).bind(now,now-180*DAY).all();
  const policy=deriveWeeklyBlockWeightPolicy(q?.results||[],{now,previous:validBlockWeightPolicy(previous,now)?previous:null});
  await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:KEY,observed_ts:now,expires_ts:policy.expires_ts,payload:policy});
  const saved=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:KEY,now});
  if(!validBlockWeightPolicy(saved,now)||saved.fingerprint!==policy.fingerprint)return{status:'BLOCK_STATS_POLICY_READBACK_NOT_CLOSED',sourceHTTP:0};
  return{status:'WEEKLY_BLOCK_POLICY_ASSESSED',sourceHTTP:0,independent_samples:policy.independent_samples,active_blocks:Object.entries(policy.blocks).filter(([,r])=>r.factor!==1).map(([id])=>id),policy_fingerprint:policy.fingerprint,proof_scope:policy.analytical_cost_reserve_not_executed_profit};
 }catch(e){return{status:'BLOCK_STATS_NOT_CLOSED',sourceHTTP:0,error:String(e.message).slice(0,160)};}
}
