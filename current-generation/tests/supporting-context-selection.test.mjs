import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectSupportingContextFacts,formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
const historical=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url)));

test('one busy block cannot evict other factual blocks from the unchanged 24-line section',()=>{
 const canonical=structuredClone(historical.canonical),facts=consumeBlockResultContext({contract:canonical.metadata.contract,now:canonical.observed_ts,evidence:canonical.metadata.internal_market_context.evidence_v2.evidence}).facts;
 // Synthetic overload belongs only to this regression. Actual use receipts
 // below are for the preserved source-backed historical evidence, not live.
 const overload=Array.from({length:40},(_,i)=>({block_id:'N07',label:`Объявление ${i}`,value:i,source:'HTX'}));
 const input=[...overload,...facts],before=JSON.stringify(input);canonical.metadata.supporting_context={facts:input};
 const selected=selectSupportingContextFacts(input),manual=formatManualReport(canonical),audit=auditRenderedBlockResults({canonical,manual});
 assert.equal(selected.length,24);assert.equal(manual.ok,true);
 assert.deepEqual(audit.used_context_block_ids.sort(),['N04','N06','N09','N12']);
 assert.equal(audit.available_not_rendered_evidence_ids.length,0);
 assert.equal(JSON.stringify(input),before);assert.equal(manual.text.split('ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ')[1].split('\n').filter(x=>x.startsWith('- ')).length,24);
});
test('all 12 active block positions survive overflow without creating missing-block facts',()=>{
 const ids=['N04','N05','N06','N07','N08','N09','N10','N11','N12','N14','N15','N16'];
 const busy=Array.from({length:32},(_,i)=>({block_id:'N04',label:'Перевод',value:i}));
 const rows=[...busy,...ids.map(block_id=>({block_id,label:block_id,value:1,...(block_id==='N05'?{field:'JOINT_SPOT_FUTURES_AGREEMENT_4H'}:{})}))],selected=selectSupportingContextFacts(rows);
 assert.equal(selected.length,24);assert.deepEqual([...new Set(selected.map(r=>r.block_id))].sort(),ids);
 assert.ok(selected.every(r=>rows.includes(r)));
 assert.equal(selectSupportingContextFacts(busy).some(r=>r.block_id==='N05'),false);
 assert.equal(selectSupportingContextFacts([]).length,0);
});
test('under-bound output and relative ordering are unchanged; unassigned facts cannot starve blocks',()=>{
 const small=[{label:'Первый',value:0},{block_id:'N15',label:'Второй',value:2}];
 assert.deepEqual(selectSupportingContextFacts(small),small);
 const rows=[...Array.from({length:24},(_,i)=>({label:`Контекст ${i}`,value:i})),...small];
 const selected=selectSupportingContextFacts(rows);
 assert.equal(selected.length,24);assert.ok(selected.includes(small[1]));
 assert.deepEqual(selected.map(r=>rows.indexOf(r)),selected.map(r=>rows.indexOf(r)).sort((a,b)=>a-b));
});
