import './audit-retained102-history-gap-census.mjs';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {expandHtxHistoryCensus} from '../runner/expanded-htx-history-census.mjs';
import {auditOriginalSignalStatistics} from '../runner/original-signal-statistics.mjs';
import {COMPACT_HTX_4H,qualifyCompactHtx90d} from '../runner/htx-compact-4h-history.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p)),output='audit-output';
const receipt=read('checkpoints/ACTUAL_HTX_COLD_HISTORY_BATCH_20261010.json'),zip=fs.readFileSync(receipt.retained_zip);
if(sha(zip)!==receipt.source_artifact_sha256)throw Error('RETAINED_ARCHIVE_ARTIFACT_HASH_REQUIRED');
const archiveBatch=JSON.parse(execFileSync('unzip',['-p',receipt.retained_zip,'actual-acquisition.json'],{maxBuffer:200000}));
if(archiveBatch.cloud_run!==receipt.source_run||archiveBatch.head!==receipt.tested_head)throw Error('ARCHIVE_ORIGINAL_RUN_HEAD_REQUIRED');
const compact=[],unqualified=[];
if(fs.existsSync('checkpoints/htx-compact-4h'))for(const file of fs.readdirSync('checkpoints/htx-compact-4h').filter(x=>x.endsWith('.manifest.json'))){
 const m=read('checkpoints/htx-compact-4h/'+file);
 if(!m.raw_file||!m.normalized_file){unqualified.push({contract:m.contract,status:m.status,reason:m.reason});continue;}
 if(![m.raw_file,m.normalized_file].every(x=>typeof x==='string'&&!x.includes('/')&&!x.includes('..')))throw Error('BOUNDED_COMPACT_SOURCE_FILENAME_REQUIRED');
 const raw=gunzipSync(fs.readFileSync('checkpoints/htx-compact-4h/'+m.raw_file)).toString(),q=qualifyCompactHtx90d({contract:m.contract,raw,received_ts:m.receipt.received_ts});
 if(sha(raw)!==m.raw_sha256||q.normalized_sha256!==m.normalized_sha256||q.observed_bars!==m.observed_bars||q.complete_90d_4h_price_only!==m.complete_90d_4h_price_only)throw Error('REQUALIFIED_COMPACT_SOURCE_MISMATCH');
 if(sha(gunzipSync(fs.readFileSync('checkpoints/htx-compact-4h/'+m.normalized_file)))!==m.normalized_sha256)throw Error('EXACT_NORMALIZED_COMPACT_BYTES_REQUIRED');
 compact.push(m);
}
const history=expandHtxHistoryCensus({base:read(output+'/factual102-history-gap-census.json'),archiveBatch,compact,anchor_end_ts:COMPACT_HTX_4H.anchor_end_ts});
if(history.status!=='PARTIAL_ACTUAL_SOURCE_COVERAGE_AND_EXPLICIT_NOT_PROVEN_INTERVALS')throw Error('EXPANDED_HISTORY_CENSUS_'+history.reason);
history.unqualified_compact_attempts=unqualified;history.actual_archive_artifact_sha256=receipt.source_artifact_sha256;history.tested_head=process.env.GITHUB_SHA||null;history.cloud_run=process.env.GITHUB_RUN_ID||null;
const dir='checkpoints/original24h-trigger-cohort-37869403339',cohort=read(dir+'/original24h-trigger-cohort.json'),gz=fs.readFileSync(dir+'/original24h-canonical-rows.json.gz'),raw=gunzipSync(gz);
if(sha(gz)!==cohort.original_canonical_gzip_sha256||sha(raw)!==cohort.original_canonical_raw_sha256)throw Error('ORIGINAL_COHORT_BYTES_REQUIRED');
const statistics=auditOriginalSignalStatistics({cohort,canonicalRows:JSON.parse(raw)});
if(statistics.status!=='SCOPED_ORIGINAL_COHORT_STATISTICS_CLOSED')throw Error('ORIGINAL_STATISTICS_'+statistics.reason);
statistics.original_cohort_file_sha256=sha(fs.readFileSync(dir+'/original24h-trigger-cohort.json'));statistics.original_canonical_gzip_sha256=sha(gz);statistics.tested_head=process.env.GITHUB_SHA||null;statistics.cloud_run=process.env.GITHUB_RUN_ID||null;
for(const [name,proof] of [['expanded102-history-coverage',history],['original-signal-statistics',statistics]])fs.writeFileSync(output+'/'+name+'.json',JSON.stringify(proof,null,2)+'\n');
// Scheduled collection persists its factual coverage and updates the two
// owner registers in the same commit as raw sources, without closing the TZ.
if(process.env.REPORT2_PERSIST_HISTORY_CENSUS==='1'){
 const path='checkpoints/HTX_EXPANDED_102_ACTUAL_COVERAGE_LATEST.json';fs.writeFileSync(path,JSON.stringify(history,null,2)+'\n');
 const summary={proof:path,cloud_run:history.cloud_run,tested_head:history.tested_head,status:history.status,verified_native_minutes:history.verified_native_minutes,structural_minutes_API_crosscheck_pending:history.structural_minutes_API_crosscheck_pending,compact_qualified_assets:history.compact_qualified_assets,complete_90d_coarse_price_assets:history.complete_90d_coarse_price_assets,complete_30d_native_assets:history.complete_30d_native_assets,complete_90d_native_assets:history.complete_90d_native_assets,source_caps_unchanged:true,project_complete:false};
 for(const p of ['checkpoints/CURRENT_PROJECT_STATUS.json','checkpoints/FULL_OWNER_TASK_REGISTER_20261007.json']){const j=read(p);j.latest_expanded102_actual_history_coverage=summary;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');}
}
console.log(JSON.stringify({history:{verified_native_minutes:history.verified_native_minutes,structural_minutes_pending:history.structural_minutes_API_crosscheck_pending,compact_assets:history.compact_qualified_assets},statistics:{initial_ideas:statistics.initial_ideas,actual_SENT:statistics.actual_initial_SENT,verified_expiries:statistics.original_TTL_expiries_verified,sampled_crossings_without_SENT:statistics.sampled_crossings_without_SENT,confirmed_ENTRY:statistics.confirmed_same_idea_ENTRY_with_settlement_and_SENT,missed_ENTRY_rate:statistics.missed_ENTRY_rate_pct}}));
