import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_CONSOLIDATED_RUNTIME_DIR||'runtime'),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{buildProtectiveAssetFilter,MONTHLY_COLLAPSE_THRESHOLD_PCT},{buildEvidenceDomainContract},{fetchBoundedOfficialEvents},{computePostEventOutcome,OUTCOME_HORIZONS}]=await Promise.all([
 load('protective-asset-filter.mjs'),load('evidence-domain-contract.mjs'),load('bounded-official-event-fetcher.mjs'),load('opportunity-intelligence-engine.mjs')
]);
const DAY=86400000,now=1800000000000;
function candles(dropPct){const start=100,end=100*(1+dropPct/100);return Array.from({length:31},(_,i)=>({ts:now-(30-i)*DAY,close:i===30?end:start}));}
test('R017 monthly collapse threshold is inclusive at -97 and does not reject unknown history',()=>{
 assert.equal(MONTHLY_COLLAPSE_THRESHOLD_PCT,-97);
 assert.equal(buildProtectiveAssetFilter({daily_candles:candles(-96.99),observed_ts:now}).hard_reject,false);
 const at=buildProtectiveAssetFilter({daily_candles:candles(-97),observed_ts:now});assert.equal(at.status,'CLOSED');assert.equal(at.hard_reject,true);assert.equal(at.reason,'MONTHLY_COLLAPSE_PROTECTIVE_FILTER');
 assert.equal(buildProtectiveAssetFilter({daily_candles:candles(-98),observed_ts:now}).hard_reject,true);
 const missing=buildProtectiveAssetFilter({daily_candles:[{ts:now,close:1}],observed_ts:now});assert.equal(missing.status,'NOT_CLOSED');assert.equal(missing.hard_reject,false);assert.equal(missing.unknown_as_safe,false);
});
test('R042 declares all required evidence domains and keeps optional missing explicit',()=>{
 const pub={evidence:[
  {status:'CLOSED',metric:'spot_flow_1h_delta_pct'},{status:'CLOSED',metric:'oi_change_1h'},{status:'CLOSED',metric:'funding_rate',history_coverage_pct:100,window:'FUNDING_HISTORY'},
  {status:'CLOSED',metric:'htx_spread_bps'},{status:'CLOSED',metric:'rs_vs_btc_1h'}
 ]};
 const opportunity={newest_event:{minute_decomposition:{},liquidity_sweep:{},market_flow:{},funding_at_event:{},relative_strength:{},post_event_current:{},candle:{}},price_oi_matrix:{},spot_perp_basis:{}};
 const d=buildEvidenceDomainContract({opportunity,public_evidence:pub,futures_component:{},liquidation_intelligence:{realized_status:'CLOSED'}});
 assert.equal(d.status,'CLOSED');assert.equal(d.all_required_domains_declared,true);assert.equal(Object.keys(d.domains).length,10);assert.equal(d.optional_missing_stays_explicit,true);assert.equal(d.unknown_as_zero,false);
 const empty=buildEvidenceDomainContract({});assert.equal(empty.status,'CLOSED');assert.equal(empty.explicit_missing_count,10);
});
test('R051 engine supports 15m and 30m exact factual outcome horizons',()=>{
 assert.equal(OUTCOME_HORIZONS['15m'],15*60000);assert.equal(OUTCOME_HORIZONS['30m'],30*60000);
 const eventClose=now-60*60000,event={event_close_ts:eventClose,candle:{open:100,close:100,high:101,low:99,volume:10},direction_at_event:'LONG',directional_evaluation_eligible:true};
 const mk=(n)=>Array.from({length:n},(_,i)=>({ts:eventClose+i*60000,end_ts:eventClose+(i+1)*60000,duration_ms:60000,open:100,high:101,low:99,close:100.1,volume:1,closed:true}));
 const series={'1m':mk(30)};
 assert.equal(computePostEventOutcome({event,horizon:'15m',series_by_timeframe:series,as_of_ts:now}).trajectory_complete,true);
 assert.equal(computePostEventOutcome({event,horizon:'30m',series_by_timeframe:series,as_of_ts:now}).trajectory_complete,true);
});
test('R078 bounded official-event fetcher enforces exact allowlist/identity and excludes rumors',async()=>{
 const fake=async()=>({ok:true,json:async()=>({events:[{published_at:'2026-09-25T00:00:00Z',event_at:'2026-09-30T00:00:00Z',contract_or_mint:'0xabc',event_type:'TOKEN_UNLOCK',title:'Official unlock'}]})});
 const p=await fetchBoundedOfficialEvents({fetch_impl:fake,allowlist:[{url:'https://project.example/events.json',host:'project.example',source_kind:'OFFICIAL_PROJECT',chain:'ethereum'}],contract_identity:'0xabc',now});
 assert.equal(p.status,'CLOSED');assert.equal(p.events.length,1);assert.equal(p.events[0].rumor,false);assert.equal(p.universal_unlock_source_assumed,false);assert.equal(p.bounded,true);
 const none=await fetchBoundedOfficialEvents({fetch_impl:fake,allowlist:[],contract_identity:'0xabc',now});assert.equal(none.status,'NOT_CONFIGURED');
});
