import test from 'node:test';import assert from 'node:assert/strict';
import {measureLiquidity} from '../../analytics/liquidity.mjs';import {selectZones} from '../../analytics/zones.mjs';import {analyzePump} from '../../analytics/index.mjs';
import {START_PROFILE as p} from '../../profile/start-v1.mjs';import {instrument,input,zone,T} from './fixtures.mjs';
test('700 and 1000 pass, 2000 fails; whole-step buy budget and same-quantity exit are measured',()=>{
  const q=measureLiquidity({asks:[[100,10],[110,100]],bids:[[99.8,10],[90,100]]},{...instrument,quantity_step:1},p);
  assert.equal(q.position_limit_usdt,1000);assert.deepEqual(q.sizes.map(x=>x.usable),[true,true,false,false,false]);
  const large=q.sizes.find(x=>x.notional_usdt===2000);assert.equal(large.entry.quantity_base,19);assert.equal(large.entry.quote_usdt,1990);
  assert.equal(large.exit.quantity_base,19);assert.equal(large.exit.quote_usdt,1808);assert.ok(Math.abs(large.exit.vwap-1808/19)<1e-10);
});
test('good asks cannot conceal excessive same-quantity exit impact',()=>{
  const q=measureLiquidity({asks:[[100,1000]],bids:[[99.8,10],[90,100]]},instrument,p),large=q.sizes.find(x=>x.notional_usdt===2000);
  assert.equal(large.entry_slippage_pct,0);assert.equal(large.usable,false);assert.ok(large.reasons.includes('EXIT_SLIPPAGE_EXCEEDS_PROFILE'));
});
test('absent, timeout and map budget exhaustion never change a ready primary idea',()=>{
  for(const status of ['ABSENT','TIMEOUT','NOT_CHECKED_BUDGET']){const x=input();x.liquidations={status,reason:status,zones:[],coverage:null};const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.liquidations.reason,status);}
});
test('two lower zones stay two with explicit one-sided map; nothing is fabricated',()=>{
  const x=input();x.liquidations={status:'PARTIAL',reason:'ONE_SIDED',zones:[zone('a',100,100.1),zone('b',90,90.1)],coverage:null};
  const a=analyzePump(x);assert.equal(a.ready,true);assert.equal(a.liquidations.zones_up.length,0);assert.equal(a.liquidations.zones_down.length,2);assert.match(a.card_text,/Карта неполная/);
});
test('same position in two provider wrappers is not double counted',()=>{
  const zones=[zone('a',100,100.1,{position_ids:['P']}),zone('b',100,100.1,{source:'SECOND_WRAPPER',position_ids:['P']})];
  const q=selectZones({status:'USABLE',zones},instrument,112,1,T,p);assert.equal(q.zones_down.length,1);assert.equal(q.zones_down[0].magnitude_value,100000);assert.equal(q.zones_down[0].components.length,2);
});
test('bounded merge cannot chain across a broad range or combine incompatible source states',()=>{
  const zones=[zone('a',100,100.2),zone('b',101,101.2),zone('c',102,102.2),zone('d',100.3,100.4,{model_version:'2'})];
  const q=selectZones({status:'USABLE',zones},instrument,112,1,T,p);
  assert.ok(q.qualified_zone_count>=3);assert.ok(q.zones_down.every(z=>z.upper-z.lower<=2));assert.ok(q.zones_down.some(z=>z.model_version==='2'));
});
test('relative intensity retains its scale and other venue without manufactured USD',()=>{
  const x=input();x.liquidations={status:'USABLE',zones:[zone('a',120,121,{magnitude_value:7,magnitude_unit:'RELATIVE_INTENSITY',relative_scale:{scale_id:'ARTIFICIAL_SCALE'}})],coverage:null};
  const a=analyzePump(x);assert.equal(a.ready,true);assert.match(a.card_text,/относительная шкала/);assert.match(a.card_text,/OTHER_VENUE/);assert.doesNotMatch(a.card_text,/7 USD/);assert.equal(a.probability.value_pct,null);
});
test('wrong asset, realized liquidation, expired or wrong-currency zones are excluded per zone',()=>{
  const zones=[zone('a',120,121,{asset_id:'OTHER'}),zone('b',120,121,{basis_type:'REALIZED'}),zone('c',120,121,{expires_ts:T-1}),zone('d',120,121,{price_currency:'USDC'})];
  const q=selectZones({status:'USABLE',zones},instrument,112,1,T,p);assert.equal(q.map_mode,'WITHOUT_MAP');assert.equal(q.rejected_zones.length,4);
});
test('unknown cross-venue mapping cannot be used merely because ticker and currency match',()=>{
  const q=selectZones({status:'USABLE',zones:[zone('a',120,121,{price_comparability:null})]},instrument,112,1,T,p);
  assert.equal(q.map_mode,'WITHOUT_MAP');assert.ok(q.rejected_zones[0].reason.includes('NOT_COMPARABLE'));
});
test('at most three upper/lower zones and source scales never manufacture a probability',()=>{
  const x=input();x.liquidations={status:'USABLE',zones:[120,130,140,150,160,170].map((v,i)=>zone(String(i),v,v+0.1,{magnitude_value:10000*(i+1)})),coverage:null};
  const a=analyzePump(x);assert.equal(a.liquidations.zones_up.length,3);assert.equal(a.liquidations.zones_up[0].lower,120);assert.equal(a.probability.value_pct,null);
});
test('an untraceable zone cannot enter a card from its usable flag alone',()=>{
  const q=selectZones({status:'USABLE',zones:[zone('a',120,121,{source:null,evidence_ref:null})]},instrument,112,1,T,p);
  assert.equal(q.map_mode,'WITHOUT_MAP');assert.equal(q.rejected_zones.length,1);
});
