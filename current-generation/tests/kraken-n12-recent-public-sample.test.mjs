import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeKrakenRecentPublicN12,verifyKrakenRecentPublicN12,KRAKEN_RECENT_DIRECTION_AVAILABILITY} from '../files/src/kraken-n12-recent-public-sample.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from '../files/src/kraken-public-taker-reference.mjs';
const root=new URL('../../',import.meta.url),folder='checkpoints/n05-broad-qualification-38066590063/';
const file=n=>readFileSync(new URL(n,root)),json=n=>JSON.parse(file(n)),hash=b=>createHash('sha256').update(b).digest('hex');
const summary=json(folder+'broad-summary.json'),hsummary=json('checkpoints/n05-actual-qualification-38049404414/catalog-summary.json'),psummary=json('checkpoints/n05-window-qualification-38050596507/window-summary.json');
function original(name,dir,receipt){return{body_utf8:gunzipSync(file(dir+name)).toString(),receipt:{url:receipt.url,http_status:receipt.http_status,received_ts:receipt.received_ts,body_sha256:receipt.body_sha256}};}
const htx=original('identity-HTX.json.gz','checkpoints/n05-actual-qualification-38049404414/',hsummary.sources.find(r=>r.name==='identity-HTX'));
const pairs=original('catalog-KRAKEN-SPOT.json.gz','checkpoints/n05-window-qualification-38050596507/',psummary.sources.find(r=>r.name==='catalog-KRAKEN-SPOT'));
function fixture(symbol='DOT'){
 const receipt=summary.sources.find(r=>r.name===`KRAKEN-${symbol}-PAIRED-RECENT`);
 return{contract:symbol+'-USDT',htx_reference:structuredClone(htx),pairs_reference:structuredClone(pairs),recent_page:original(receipt.file,folder,receipt),window_plan:{plan_id:'N05_BROAD:38066590063',known_ts:summary.started_ts,window_end_ts:summary.window_end_ts},now:summary.completed_ts};
}
function editWire(c,fn){const x=JSON.parse(c.body_utf8);fn(x);c.body_utf8=JSON.stringify(x);c.receipt.body_sha256=hash(c.body_utf8);}
for(const [symbol,count] of [['DOT',8],['ATOM',4]])test(`NEW RECENT_PUBLIC ${symbol} neutral5m native input without240/SINCE requalification`,t=>{
 const c=fixture(symbol),out=normalizeKrakenRecentPublicN12(c);assert.equal(out.status,'CLOSED_BOUNDED_RECENT_PUBLIC_SAMPLE',out.reason);assert.equal(out.evidence.length,1);const r=out.evidence[0];
 assert.equal(r.valid_recent_rows,count);assert.equal(r.returned_rows,1000);assert.equal(r.saturated,true);assert.equal(r.unit,'USDT');assert.equal(r.carrier_kind,'RECENT_PUBLIC_NO_SINCE');assert.equal(r.window_end,1791648600000);assert.equal(r.first_known_ts,1791648709892);assert.equal(r.observed_ts,r.first_known_ts);assert.ok(r.first_known_ts>=1791648650537);assert.equal(r.source_receipts.recent.received_ts,c.recent_page.receipt.received_ts);assert.equal(r.whole_window_coverage_proven,false);assert.equal(r.full_240m_qualification_claimed,false);assert.equal(r.coverage_fraction,0);assert.equal(r.directional_strength,null);assert.equal(r.risk_strength,null);assert.equal(r.score_contribution,0);assert.equal(r.entry_authorized,false);assert.equal(r.liquidation_as_target,false);assert.equal(r.independent_venue_count,1);assert.equal(out.network_calls,0);assert.equal(verifyKrakenRecentPublicN12(r,c,c.now),true);
 assert.equal(hash(c.recent_page.body_utf8),r.source_receipts.recent.body_sha256);assert.equal(hash(JSON.stringify(JSON.parse(c.recent_page.body_utf8))),r.source_receipts.recent.payload_sha256);
 t.diagnostic('RECENT_PUBLIC_WITNESS '+JSON.stringify({contract:r.htx_contract,source_ts:r.source_ts,received_ts:r.source_receipts.recent.received_ts,first_known_ts:r.first_known_ts,observed_ts:r.observed_ts,expires_at:r.expires_at,rows:r.valid_recent_rows,returned_rows:r.returned_rows,buy_usdt:r.buy_quote_turnover_usdt,sell_usdt:r.sell_quote_turnover_usdt,imbalance:r.taker_imbalance,evidence_id:r.evidence_id,raw_hash:r.raw_hash,bytes:Buffer.byteLength(JSON.stringify(r)),current_connection_proven:false,whole_window_coverage_proven:false}));
});
test('direction reference uses saved completion bound, not a retroactive raw receipt lower bound',()=>{
 assert.equal(hash(file(folder+'broad-summary.json')),KRAKEN_RECENT_DIRECTION_AVAILABILITY.summary_sha256);assert.equal(summary.completed_ts,KRAKEN_RECENT_DIRECTION_AVAILABILITY.known_ts);assert.equal(Math.max(...KRAKEN_PUBLIC_TAKER_REFERENCE.immutable_receipts.map(r=>r.received_ts)),KRAKEN_RECENT_DIRECTION_AVAILABILITY.raw_receipt_lower_bound);
 const c=fixture();c.now=1791648650537;assert.equal(normalizeKrakenRecentPublicN12(c).evidence.length,0);
});
const mutations=[
 ['missing original plan',c=>c.window_plan=null],
 ['cutoff taken from latest trade',c=>c.window_plan.window_end_ts=1791648480000],
 ['missing plan known clock',c=>c.window_plan.known_ts=null],
 ['reference not yet known',c=>c.now=1791648709891],
 ['expired trade context without refresh',c=>c.now=1791648769892],
 ['SINCE request falsely called RECENT_PUBLIC',c=>c.recent_page.receipt.url+='&since=1791634200000000000'],
 ['different page cap',c=>c.recent_page.receipt.url=c.recent_page.receipt.url.replace('1000','100')],
 ['foreign pair URL',c=>c.recent_page.receipt.url=c.recent_page.receipt.url.replace('DOTUSDT','ATOMUSDT')],
 ['missing wire digest',c=>c.recent_page.receipt.body_sha256=null],
 ['changed wire body with old digest',c=>c.recent_page.body_utf8+=' '],
 ['future receipt',c=>c.recent_page.receipt.received_ts=c.now+1],
 ['expired static reference',c=>c.pairs_reference.receipt.received_ts-=21600000],
 ['failed HTTP',c=>c.recent_page.receipt.http_status=429],
 ['provider error envelope',c=>editWire(c.recent_page,p=>p.error=['error'])],
 ['foreign result namespace',c=>editWire(c.recent_page,p=>{p.result.ATOMUSDT=p.result.DOTUSDT;delete p.result.DOTUSDT;})],
 ['duplicate raw trade',c=>editWire(c.recent_page,p=>p.result.DOTUSDT[1]=p.result.DOTUSDT[0])],
 ['unknown taker side',c=>editWire(c.recent_page,p=>p.result.DOTUSDT[0][3]='unknown')],
 ['future native trade',c=>editWire(c.recent_page,p=>p.result.DOTUSDT.at(-1)[2]=(c.recent_page.receipt.received_ts+1000)/1000)],
 ['wrong quote asset',c=>editWire(c.pairs_reference,p=>p.result.DOTUSDT.quote='USDC')],
 ['wrapped token substituted for native chain',c=>editWire(c.htx_reference,p=>p.data.find(r=>r.currency==='dot').chains.find(r=>r.chain==='dot1').chainType=1)],
 ['duplicate primary currency',c=>editWire(c.htx_reference,p=>p.data.push(p.data.find(r=>r.currency==='dot')))],
 ['unqualified native project',c=>c.contract='BTC-USDT'],
 ['unverified continuation cursor',c=>editWire(c.recent_page,p=>p.result.last='UNKNOWN')]
];
for(const [label,change] of mutations)test(`RECENT_PUBLIC refuses ${label}`,()=>{const c=fixture();change(c);assert.equal(normalizeKrakenRecentPublicN12(c).evidence.length,0);});
test('no recent rows remain unavailable rather than a successful zero flow',()=>{
 const c=fixture();editWire(c.recent_page,p=>p.result.DOTUSDT.forEach(r=>r[2]-=3600));const out=normalizeKrakenRecentPublicN12(c);assert.equal(out.status,'NO_RECENT_ORIGINAL_TRADES');assert.equal(out.check_completed,false);assert.equal(out.evidence.length,0);
});
test('full original carrier rederivation rejects altered stored scalar, clock, lineage and weight',()=>{
 const c=fixture('ATOM'),row=normalizeKrakenRecentPublicN12(c).evidence[0];
 for(const edit of [r=>r.value+=1,r=>r.source_ts+=1,r=>r.first_known_ts=1791648650537,r=>r.coverage_fraction=1,r=>r.directional_strength=1,r=>r.score_contribution=1,r=>r.entry_authorized=true,r=>r.independent_venue_count=2,r=>r.whole_window_coverage_proven=true,r=>r.raw_hash='0'.repeat(64)]){const copy=structuredClone(row);edit(copy);assert.equal(verifyKrakenRecentPublicN12(copy,c,c.now),false);}
});
test('normalization preserves input bytes and does not refresh the historical firstknown clock',()=>{
 const c=fixture(),before=JSON.stringify(c),first=normalizeKrakenRecentPublicN12(c).evidence[0];const later=normalizeKrakenRecentPublicN12({...c,now:c.now+1000}).evidence[0];assert.equal(JSON.stringify(c),before);assert.equal(first.first_known_ts,later.first_known_ts);assert.equal(first.source_ts,later.source_ts);assert.equal(first.raw_hash,later.raw_hash);
});
// Only the NEW guard proposal is loaded in isolation. Frozen504 module/tests
// are unchanged and its old27-case suite is not executed here.
test('N10 proposed guard treats owner15 as archive cohort while keeping all unqualified inputs refused',async()=>{
 const basePath=new URL('../files/src/kraken-n10-price-path.mjs',import.meta.url),baseline=readFileSync(basePath,'utf8'),dir=new URL('../../checkpoints/source-worker-kraken-recent-public-20261019/',import.meta.url),meta=JSON.parse(readFileSync(new URL('n10-guard-proposal.json',dir)));assert.equal(hash(baseline),meta.baseline_sha256);
 let proposed=readFileSync(new URL('n10-owner15-scope.proposed.mjs',dir),'utf8');assert.equal(hash(proposed),meta.proposed_sha256);
 const tail=' const p=s?.payload';assert.equal(baseline.slice(baseline.indexOf(tail)),proposed.slice(proposed.indexOf(tail)));
 proposed=proposed.replace(/from '\.\/(.*?)'/g,(_all,name)=>`from '${new URL(name,basePath).href}'`);
 const module=await import('data:text/javascript;base64,'+Buffer.from(proposed).toString('base64'));
 for(const contract of module.KRAKEN_N10_OWNER_NO_EXTERNAL_SPOT){const out=module.prepareKrakenN10RuntimeInput({contract});assert.equal(out.runtime_input_qualified,false);assert.notEqual(out.status,'OWNER_EXTERNAL_SPOT_NOT_ALLOWED');}
 assert.equal(module.prepareKrakenN10RuntimeInput({contract:'MAGIC-USDT'}).status,'APPROVED_HTX_CONTRACT_REQUIRED');
 assert.equal(module.prepareKrakenN10RuntimeInput({contract:'ALGO-USDT'}).runtime_input_qualified,false);
});

test('historical bodies cannot be revived as a current19Oct source fact',()=>{const c=fixture();c.now=1792395949688;const out=normalizeKrakenRecentPublicN12(c);assert.equal(out.check_completed,false);assert.equal(out.evidence.length,0);});
