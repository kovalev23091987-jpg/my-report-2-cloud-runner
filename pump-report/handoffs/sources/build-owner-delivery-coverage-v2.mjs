import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {normalizeSourceCoverage} from '../../sources/coverage.mjs';
const root=new URL('../../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const authority=await read('pump-report/handoffs/sources/COVERAGE_OWNER_DELIVERY_AUTHORITY_V2.json');assert(Date.now()<authority.expires_ts);
globalThis.fetch=()=>{throw Error('OWNER_EXCLUSION_NO_COLLECTION');};
const oldBytes=await fs.readFile(new URL('pump-report/handoffs/sources/OPERATOR_COVERAGE13_V1.json',root)),old=JSON.parse(oldBytes);
const registry=(await read('pump-report/sources/registry-curated13-native-relative-v1.json')).instruments;
const observations=[];
for(const row of old.rows)for(const[kind,c]of Object.entries(row.sources))if(c.ever_checked)observations.push({instrument_id:row.instrument_id,kind,
 qualified:c.unqualified===true?false:c.status_at_capture==='USABLE'?true:null,status_at_capture:c.status_at_capture,
 capture_ts:c.capture_ts,event_ts:c.event_ts,received_ts:c.received_ts,expires_ts:c.expires_ts,freshness_upper_bound_ts:c.freshness_upper_bound_ts,
 freshness_basis:c.freshness_basis,clock_missing_reason:c.clock_missing_reason,receipt_ref:c.receipt_ref,artifact_sha256:c.artifact_sha256,reason_codes:c.reason_codes});
const reports=old.ready_without_map_reports.map(r=>({instrument_id:r.instrument_id,ready:true,mode:r.mode,delivery_state:r.delivery_state,
 message_id:r.message_id,map_mode:r.map_mode,map_reason:r.map_reason_from_saved_analysis,analysis_ts:r.analysis_ts,
 artifact_sha256:r.artifact_sha256,report_classification:r.message_id==='240'?'ACCEPTANCE_TEST':'UNCLASSIFIED'}));
const summary={...old.summary_snapshot,status:old.summary_snapshot.status_at_capture,report_context:'ACCEPTANCE_TEST'};
const delivery_policy={excluded_asset_ids:authority.owner_delivery_excluded_assets,evidence_ref:authority.owner_instruction_source};
const result=normalizeSourceCoverage({registry,as_of_ts:Date.now(),observations,reports,summary,delivery_policy,
 universe:{unknown_active_USDT:919,owner_excluded_gold_backed:2,as_of_ts:old.universe_counts_as_of}});
assert.equal(result.verified_denominator,13);assert.equal(result.deliverable_verified_denominator,11);assert.equal(result.owner_delivery_excluded_verified_count,2);
assert.equal(result.owner_excluded_gold_backed,2);assert.equal(result.unknown_active_USDT,919);assert.equal(result.complete_crypto_N,null);
const excluded=result.rows.filter(r=>r.owner_delivery_excluded);assert.deepEqual(excluded.map(r=>r.asset_id).sort(),authority.owner_delivery_excluded_assets.slice().sort());
assert(excluded.every(r=>r.crypto_classification==='VERIFIED_CRYPTO'));
assert.equal(result.totals.core.ever_checked,1);assert.equal(result.totals.core.not_checked,12);
assert.equal(result.deliverable_totals.core.ever_checked,0);assert.equal(result.deliverable_totals.core.not_checked,11);
assert.equal(result.acceptance_test_ready_without_map_manual_sent_count,1);assert.equal(result.production_ready_without_map_manual_sent_count,0);
assert.equal(result.ready_without_map_manual_sent_count,0);assert.equal(result.historical_ready_without_map_manual_sent_count,1);
assert.equal(result.ready_without_map_reports[0].report_classification,'ACCEPTANCE_TEST');assert.equal(result.summary_snapshot.production_count_eligible,false);
result.authority=authority;result.previous_snapshot_sha256=sha(oldBytes);result.evidence_files=old.evidence_files;
result.clock_limits=old.clock_limits;result.core_capture_details=old.core_capture_details;result.map_capture_details=old.map_capture_details;
result.original_private_card_analysis_and_wave_rewritten=false;result.new_IO={marketHTTP:0,SQL:0,TG:0,WS:0,deploy:0};
result.source_catalog_queue_or_sender_harddeny_implemented_by_this_module=false;
assert(Date.now()<authority.expires_ts);assert(Date.now()-authority.acquired_ts<600000);
await fs.writeFile(new URL('pump-report/handoffs/sources/OPERATOR_COVERAGE13_OWNER_DELIVERY_V2.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({identity13:13,deliverable11:11,owner_delivery_excluded2:2,gold_excluded2:2,unknown919:919,message240:'ACCEPTANCE_TEST',production_ready_without_map:0,acceptance_test_ready_without_map:1,original_records_unchanged:true,new_marketHTTP:0})+'\n');
