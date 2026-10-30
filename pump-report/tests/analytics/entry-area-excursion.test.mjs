import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {evaluateOutcome} from '../../analytics/outcome.mjs';
import {path,signal,T,MINUTE} from './fixtures.mjs';

const dir=new URL('../../handoffs/analytics/package-o/',import.meta.url),H=14400000;
const plan={entry_zones:[{lower:95,upper:96}],exit_zone:{lower:108,upper:109},invalidation:{kind:'PRICE_BELOW',price:89}};
const original=signal({rules_version:'ARTIFICIAL_ORIGINAL_RULES_UNCHANGED',plan});
// A small before/after oracle on these fixtures only, not an old test battery.
const beforeSource=(await readFile(new URL('../../handoffs/analytics/package-o/baseline/outcome.before.mjs',import.meta.url),'utf8')).replace(/from\s*'([^']+)'/g,(s,p)=>p.startsWith('.')?"from '"+pathToFileURL(resolve('pump-report/analytics',p)).href+"'":s);
const {evaluateOutcome:before}=await import('data:text/javascript;base64,'+Buffer.from(beforeSource).toString('base64'));
function unchanged(args){const input=structuredClone(args),a=evaluateOutcome(args),old=before(args),copy=structuredClone(a);if(copy.scenario_outcome)delete copy.scenario_outcome.entry_area_excursion;assert.deepEqual(copy,old);assert.deepEqual(args,input);assert.equal(a.rules_version,args.signal.rules_version);assert.equal(a.target_price,110);assert.equal(a.t0,args.signal.t0);assert.equal(a.deadline_ts,args.signal.t0+H);return a;}
const assertUnknown=(m,reason)=>{assert.equal(m.area_floor_price,null);assert.equal(m.contact_confirmed_by_ts,null);assert.equal(m.post_confirmation_low_observed,null);assert.equal(m.below_area_pct_lower_bound,null);assert.equal(m.reason,reason);};

test('O01 area-relative lower bound excludes the deep contact-bar low, retains gap uncertainty and respects exact points',async()=>{
  const rows=path({low:99,high:109});rows[0]={...rows[0],open:100,high:101,low:80,close:95.5};rows[1]={...rows[1],open:95.5,high:97,low:94,close:96};rows[20]={...rows[20],open:100,high:109,low:93,close:100};
  const full=unchanged({signal:original,candles:rows,as_of_ts:T+H}),m=full.scenario_outcome.entry_area_excursion;assert.equal(full.status,'MISS');assert.equal(m.area_floor_price,95);assert.equal(m.contact_confirmed_by_ts,T+MINUTE);assert.equal(m.post_confirmation_low_observed,93);assert.ok(Math.abs(m.below_area_pct_lower_bound-100*(1-93/95))<1e-12);assert.equal(m.reason,'OBSERVED_LOWER_BOUND_AFTER_CONFIRMED_CONTACT');assert.ok(Math.abs(full.drawdown_total_pct-20)<1e-12);assert.ok(m.below_area_pct_lower_bound<3,'80 before/after unknown contact is never relabelled as exact post-entry DD');assert.equal(full.scenario_outcome.execution_proven,false);assert.equal(full.scenario_outcome.user_profit,null);
  const gap=unchanged({signal:original,candles:rows.filter((_,i)=>i!==10),as_of_ts:T+H});assert.equal(gap.status,'UNKNOWN');assert.equal(gap.drawdown_total_pct,null);assert.deepEqual(gap.scenario_outcome.entry_area_excursion,m);
  const hitRows=structuredClone(rows);hitRows[100].high=111;const hit=unchanged({signal:original,candles:hitRows.filter((_,i)=>i!==10),as_of_ts:T+H});assert.equal(hit.status,'HIT');assert.equal(hit.drawdown_total_pct,null);assert.deepEqual(hit.scenario_outcome.entry_area_excursion,m);
  const onlyRange=path({low:99,high:109});onlyRange[0]={...onlyRange[0],open:100,high:101,low:90,close:100};const pointArgs={signal:original,candles:onlyRange,price_points:[{event_ts:T+30000,price:95.5},{event_ts:T+31000,price:94},{event_ts:T+H+1,price:1}],as_of_ts:T+H};const point=unchanged(pointArgs),pm=point.scenario_outcome.entry_area_excursion;assert.equal(pm.contact_confirmed_by_ts,T+30000);assert.equal(pm.post_confirmation_low_observed,94);assert.ok(Math.abs(pm.below_area_pct_lower_bound-100*(1-94/95))<1e-12);assert.equal(pm.reason,'OBSERVED_LOWER_BOUND_AFTER_CONFIRMED_CONTACT');
  await writeFile(new URL('observed-bound-artificial.json',dir),JSON.stringify({evidence:'ARTIFICIAL_ONLY',full,gap,hit,point,native_HTTP:0,native_SQL:0,Telegram:0},null,2)+'\n');
});
test('O02 ambiguous areas, boundary/range-only contacts and missing later observations stay null with reasons and preserve all old outcomes',async()=>{
  const rows=path({low:99,high:109});rows[0]={...rows[0],open:100,high:101,low:90.5,close:95.5};const multi=signal({...original,plan:{...plan,entry_zones:[{lower:95,upper:96},{lower:90,upper:91}]}});
  const ambiguous=unchanged({signal:multi,candles:rows,as_of_ts:T+H});assertUnknown(ambiguous.scenario_outcome.entry_area_excursion,'FIRST_ENTRY_AREA_ORDER_UNKNOWN');
  const boundaryRows=path({start:T,count:241,low:99,high:109});boundaryRows[0]={...boundaryRows[0],low:95.5};const boundary=unchanged({signal:{...original,t0:T+123},candles:boundaryRows,as_of_ts:T+H+MINUTE});assert.equal(boundary.status,'MISS');assertUnknown(boundary.scenario_outcome.entry_area_excursion,'BOUNDARY_CONTACT_UNCONFIRMED');
  const endingRows=path({start:T,count:241,low:99,high:109});endingRows[1]={...endingRows[1],low:95,close:95.5};endingRows[2].low=94;endingRows[240].low=80;
  const ending=unchanged({signal:{...original,t0:T+123},candles:endingRows,as_of_ts:T+H+MINUTE});assert.equal(ending.status,'MISS');assert.equal(ending.scenario_outcome.entry_area_excursion.post_confirmation_low_observed,94,'low80 of the candle extending after deadline is excluded');assert.ok(ending.scenario_outcome.entry_area_excursion.below_area_pct_lower_bound<2);
  const rangeRows=path({low:99,high:109});rangeRows[0].low=90;const range=unchanged({signal:original,candles:rangeRows,as_of_ts:T+H});assertUnknown(range.scenario_outcome.entry_area_excursion,'RANGE_TOUCH_ONLY');
  const noLater=unchanged({signal:original,candles:[],price_points:[{event_ts:T+1000,price:95.5}],as_of_ts:T+H});const n=noLater.scenario_outcome.entry_area_excursion;assert.equal(n.area_floor_price,95);assert.equal(n.contact_confirmed_by_ts,T+1000);assert.equal(n.post_confirmation_low_observed,null);assert.equal(n.below_area_pct_lower_bound,null);assert.equal(n.reason,'NO_POST_CONFIRMATION_OBSERVATIONS');
  const incompleteRows=path({low:99,high:109}).filter((_,i)=>i!==0);incompleteRows[3]={...incompleteRows[3],open:100,high:101,low:95,close:95.5};const incomplete=unchanged({signal:signal({...original,plan:{...plan,entry_zones:[{lower:95,upper:96},{lower:85,upper:86}]}}),candles:incompleteRows,as_of_ts:T+H});assertUnknown(incomplete.scenario_outcome.entry_area_excursion,'FIRST_ENTRY_AREA_HISTORY_INCOMPLETE');
  const absent=unchanged({signal:{...original,plan:null},candles:path({low:99,high:109}),as_of_ts:T+H});assertUnknown(absent.scenario_outcome.entry_area_excursion,'PLAN_UNAVAILABLE');
  await writeFile(new URL('unknown-cases-artificial.json',dir),JSON.stringify({evidence:'ARTIFICIAL_ONLY',ambiguous,boundary,ending,range,noLater,incomplete,absent,native_HTTP:0,native_SQL:0,Telegram:0},null,2)+'\n');
});
