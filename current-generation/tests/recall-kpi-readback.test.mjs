import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recallKpiReadbackMatches} from '../files/src/recall-kpi-readback.mjs';
const keys=['strategy_changed','decision_weights_changed','live_probability','validated_signal','automatic_telegram','trading_execution'];
function pair(count){const record={mode:'DISCOVERY_RECALL_KPI_SHADOW_V1',status:count===0?'NOT_CLOSED':count===3?'CLOSED':'PARTIAL',closed_horizons:['1h','4h','24h'].slice(0,count),source_run_id:'real-run',audit_ts:1791111300000};return{record,row:{...record,closed_horizons:count,kpi_json:JSON.stringify(record),...Object.fromEntries(keys.map(k=>[k,0]))}};}
test('zero, partial and complete horizon results survive exact database readback',()=>{
 for(let count=0;count<=3;count++){const {row,record}=pair(count);assert.equal(recallKpiReadbackMatches(row,record),true);}
});
test('stale records, invented completeness and altered safety flags fail readback',()=>{
 const {row,record}=pair(0);
 for(const change of [{status:'CLOSED'},{closed_horizons:1},{source_run_id:'another'},{audit_ts:record.audit_ts+1},{kpi_json:'{}'},...keys.flatMap(k=>[{[k]:1},{[k]:null}])])assert.equal(recallKpiReadbackMatches({...row,...change},record),false);
});
test('canonical result is saved before low priority observers can throw',()=>{
 const src=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.ok(src.indexOf("await fs.writeFile('report2-run-result.json'")<src.indexOf('const lowPriorityCadenceDue'));
 assert.ok(src.includes('recallKpiReadbackMatches(persistedRow,record)'));
});

test('result reads use existing contract/run index and cannot scan all publications',()=>{
 const src=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
 assert.match(src,/WHERE run_id=\?1 AND contract_code IN/u);
 assert.match(src,/candidateContracts:env\.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT\?\.deep_check_selected/u);
});
