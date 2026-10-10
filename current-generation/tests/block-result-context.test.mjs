import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url)));
const input=()=>structuredClone(fixture.canonical);
const consume=c=>consumeBlockResultContext({contract:c.metadata.contract,now:c.observed_ts,evidence:c.metadata.internal_market_context.evidence_v2.evidence});
function prepared(){const c=input();c.metadata.supporting_context={facts:consume(c).facts};return c;}

test('actual historical BTW flows, margin permission and bounded trades reach existing report layout without inventing score',()=>{
 const c=prepared(),score=JSON.stringify(c.metadata.supplemental_score_adjustment),facts=consume(c).facts;
 assert.deepEqual(facts.map(f=>f.block_id).sort(),['N04','N06','N09','N12']);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);
 const proof=auditRenderedBlockResults({canonical:c,manual});
 assert.deepEqual(proof.used_context_block_ids.sort(),['N04','N06','N09','N12']);
 assert.equal(JSON.stringify(c.metadata.supplemental_score_adjustment),score);
 assert.equal(proof.entry_authorized,false);
 assert.match(manual.text,/ограниченная выборка, не суточный поток/);
 assert.match(manual.text,/изолированная маржа/);
 assert.equal(consume(c).facts.some(f=>['N01','N14'].includes(f.block_id)),false);
});

test('expired, foreign, future and corrupted sums cannot become report facts',()=>{
 for(const mutate of [row=>row.htx_contract='OTHER-USDT',row=>row.expires_at=0,row=>row.observed_ts=input().observed_ts+1,row=>row.source_ts=input().observed_ts+1]){
  const c=input();c.metadata.internal_market_context.evidence_v2.evidence.forEach(mutate);assert.equal(consume(c).facts.length,0);
 }
 const c=input(),rows=c.metadata.internal_market_context.evidence_v2.evidence;
 rows.find(row=>row.block_id==='N05').value+=100;
 rows.find(row=>row.block_id==='N12').sell_quote_turnover_usdt+=100;
 rows.find(row=>row.block_id==='N09').execution_open_scope='UNKNOWN';
 assert.deepEqual(consume(c).facts.map(f=>f.block_id).sort(),['N04','N06']);
});

test('formatter failure and metadata alone never establish use; real block facts survive bounded display selection',()=>{
 const c=prepared();assert.equal(auditRenderedBlockResults({canonical:c,manual:{ok:false,text:null}}).context_receipts.length,0);
 c.metadata.supporting_context.facts.unshift(...Array.from({length:24},(_,i)=>({label:`Другая проверка ${i}`,value:i,source:'HTX'})));
 const manual=formatManualReport(c);assert.equal(manual.ok,true);
 assert.equal(auditRenderedBlockResults({canonical:c,manual}).context_receipts.length,5);
 assert.equal(auditRenderedBlockResults({canonical:c,manual}).available_not_rendered_evidence_ids.length,0);
 c.metadata.supporting_context.facts=[];
 assert.equal(auditRenderedBlockResults({canonical:c,manual:{ok:true,text:consume(c).facts.map(f=>`- ${f.label}: ${f.value}`).join('\n')}}).context_receipts.length,0);
});

test('physical copies are counted once and contextual facts never vote on entry',()=>{
 const c=input(),rows=c.metadata.internal_market_context.evidence_v2.evidence;
 rows.push(...structuredClone(rows));assert.equal(consume(c).facts.length,5);
 for(const fact of consume(c).facts){assert.equal(fact.score_contribution,0);assert.equal(fact.directional_vote,false);assert.equal(fact.hard_gate,false);}
});

test('point supply, bounded zero attention and serial transfers provide small factual benefit with precise limits',()=>{
 const c=prepared(),facts=consume(c).facts;
 assert.equal(facts.some(f=>f.block_id==='N02'),false);
 assert.match(facts.find(f=>f.block_id==='N06').value,/60 минут: 0 авторов, 0 сообщений.*только по адресу/u);
 const transfer=facts.find(f=>f.block_id==='N04');assert.equal(transfer.evidence_ids.length,3);
 assert.match(transfer.value,/3 событий в одной транзакции; 238000000000000000000 минимальных единиц в каждом событии/u);
 assert.doesNotMatch(transfer.value,/714/u);
 const rows=c.metadata.internal_market_context.evidence_v2.evidence;
 rows.find(r=>r.block_id==='N02').htx_contract='OTHER-USDT';
 assert.match(consume(c).facts.find(f=>f.block_id==='N04').value,/минимальных единиц/u);
 rows.find(r=>r.block_id==='N06').query_identity='TICKER';
 assert.equal(consume(c).facts.some(f=>f.block_id==='N06'),false);
});
