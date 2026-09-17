import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildShadowDecisionTelemetry } from '../src/shadow-decision-model.mjs';

const raw=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const source=raw.replace(/from "(\.\/[^"\n]+\.mjs)"/g,(_,p)=>`from ${JSON.stringify(new URL('../src/'+p.slice(2),import.meta.url).href)}`);
const api=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {buildDeepCheckQueue,buildDiscoveryPrefilter};').toString('base64'));
function row(contract,{fundingPct=0,p1=0,p4=0,o1=0,o4=0,turnover=200000,oi=150000}={}){return {contract_code:contract,data_status:'CLOSED',freshness:{stale:false,market_age_sec:5},quality:{market_present:true,oi_present:true,funding_present:true,history_available:true},symbol_fingerprint:{resolution_status:'RESOLVED_HTX_EXACT'},instrument_scope:{classification:'CRYPTO_CONFIRMED'},turnover_24h_usdt:turnover,open_interest:{value_usdt:oi,contracts:oi},funding:{funding_rate:fundingPct/100,funding_rate_pct:fundingPct,interval_hours:4},transitions:{'5m':{price_change_pct:0,oi_change_pct:0},'15m':{price_change_pct:0,oi_change_pct:0},'1h':{price_change_pct:p1,oi_change_pct:o1},'4h':{price_change_pct:p4,oi_change_pct:o4}}};}
test('funding extremes stay in neutral discovery queue and never choose direction',()=>{
 const scan={timestamp:Date.now(),contracts:[row('BTC-USDT',{turnover:9e9,oi:5e9,p1:0.2,p4:1}),row('ETH-USDT',{turnover:8e9,oi:4e9,p1:0.2,p4:1}),row('NEG-USDT',{fundingPct:-2}),row('POS-USDT',{fundingPct:2}),...Array.from({length:12},(_,i)=>row(`F${i}-USDT`,{turnover:300000+i*10000,oi:200000+i*10000,fundingPct:0.001}))]};
 const q=api.buildDeepCheckQueue(scan); const d=api.buildDiscoveryPrefilter(scan,q,{max_shortlist:24,min_anomaly_flags:2,min_early_flags:2});
 for(const c of ['NEG-USDT','POS-USDT']){const x=d.shortlist.find(r=>r.contract===c);assert.ok(x,`${c} must remain discoverable`);assert.equal(x.long_watch,false);assert.equal(x.short_watch,false);assert.equal(x.funding_context_only,true);assert.equal(x.funding_directional_vote,false);assert.equal(x.discovery_direction_hint,'NEUTRAL_ANOMALY');}
});
test('shadow decision funding is visible context but contributes zero direction',()=>{
 const f={data:{funding:{funding_rate_pct:-2},coverage:{}}};
 const r=buildShadowDecisionTelemetry({contract:'X-USDT',now:Date.now(),futures:f,spot:{data:{}},trajectory:{data:{coverage:{},windows:{}}},history:{data:{}},dataSufficiency:{classification:'INSUFFICIENT'}});
 assert.equal(r.evidence_flags.funding_pct,-2);assert.equal(r.feature_contributions.funding_pct_contrarian.available,true);assert.equal(r.feature_contributions.funding_pct_contrarian.weight,0);assert.equal(r.feature_contributions.funding_pct_contrarian.contribution_long,0);assert.equal(r.feature_contributions.funding_pct_contrarian.contribution_short,0);assert.equal(r.direction_hint,'NEUTRAL');assert.equal(r.dc_shadow_long,null);assert.equal(r.dc_shadow_short,null);
});
test('worker inline shadow model also has no signed funding feature',()=>{
 assert.ok(!raw.includes('addSignedFeature(state, "funding_pct_contrarian", extractFundingPct(futuresData), 0.05, 8, true)'));
 assert.ok(raw.includes('context_only_not_directional'));
});
