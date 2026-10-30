import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync,gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {qualifySavedHtx4hTurnover,deriveCompleteUtcBuckets,sha256} from './htx4h-native-turnover.mjs';

export const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const read=p=>fs.readFileSync(path.join(repo,p));
export function qualifyCohort(){
 const inputs=JSON.parse(fs.readFileSync(path.join(here,'cohort-inputs.json')));
 const original=execFileSync('git',['show',`${inputs.inventory_git_commit}:${inputs.inventory_path}`],{cwd:repo,maxBuffer:1_000_000});
 assert.equal(sha256(original),inputs.inventory_sha256);assert.equal(original.length,inputs.inventory_bytes);
 assert.deepEqual(inputs.records,JSON.parse(original).HTX_4h_actual_manifests.records);
 assert.equal(inputs.records.length,37);assert.equal(new Set(inputs.records.map(r=>r.contract)).size,37);
 const artifacts=[],summaries=[];let priceRows=0;
 for(const row of inputs.records){
  for(const label of ['manifest','raw','normalized']){
   const p=row[label];assert.equal(p.path,`checkpoints/htx-compact-4h/${row.contract}.${label==='manifest'?'manifest.json':label+'.json.gz'}`);
   const data=read(p.path);assert.equal(data.length,p.bytes);assert.equal(sha256(data),p.sha256);
  }
  const manifest=JSON.parse(read(row.manifest.path)),body=gunzipSync(read(row.raw.path)).toString('utf8'),normalizedBody=gunzipSync(read(row.normalized.path)),old=JSON.parse(normalizedBody);
  assert.equal(sha256(body),row.raw_body_sha256);assert.equal(sha256(normalizedBody),row.normalized_body_sha256);
  assert.equal(manifest.normalized_sha256,row.normalized_body_sha256);
  const actual=qualifySavedHtx4hTurnover({contract:row.contract,manifest,raw_utf8:body,expected_raw_sha256:row.raw_body_sha256});
  assert.equal(actual.raw_rows,row.raw_row_count);assert.equal(actual.rows.length,row.raw_certainly_closed_4h_rows_by_native_reply_ts);
  assert.equal(actual.first_known_ts,row.receipt.received_ts);assert.equal(actual.source_ts,row.source_ts);
  const byTime=new Map(actual.rows.map(r=>[r.open_ts,r]));
  for(const prior of old){
   const r=byTime.get(prior.open_ts);assert.ok(r,`${row.contract} old price row represented`);assert.equal(r.end_ts-1,prior.close_ts);
   for(const k of ['open','close','high','low'])assert.equal(Number(r.native_lexemes[k]),prior[k]);priceRows++;
  }
  assert.equal(old.length,row.normalized_rows);assert.equal(manifest.volume_qualified,false);
  const day=deriveCompleteUtcBuckets(actual,'DAY'),week=deriveCompleteUtcBuckets(actual,'WEEK_MONDAY');
  artifacts.push({original_files:{manifest:row.manifest,raw:row.raw,normalized:row.normalized},native:actual,derived_utc:{day,week}});
  summaries.push({contract:row.contract,original_price_manifest_status:row.status,original_volume_qualified:false,
   original_raw_sha256:row.raw_body_sha256,first_known_ts:actual.first_known_ts,source_ts:actual.source_ts,
   raw_rows:actual.raw_rows,qualified_closed_4h_rows:actual.rows.length,forming_excluded:actual.excluded.length,
   first_open_ts:actual.rows[0].open_ts,last_end_ts:actual.rows.at(-1).end_ts,gaps:actual.gaps,
   old_price_rows_preserved:old.length,complete_derived_utc_days:day.complete.length,complete_derived_utc_weeks:week.complete.length,
   incomplete_derived_days:day.incomplete.length,incomplete_derived_weeks:week.incomplete.length,
   has_20_complete_derived_weeks:week.complete.length>=20,latest_closed_native_row:actual.rows.at(-1),
   first_complete_derived_week:week.complete[0]??null});
 }
 const payload={schema:'HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_COHORT_V1',inventory_commit:inputs.inventory_git_commit,inventory_sha256:inputs.inventory_sha256,artifacts};
 const body=Buffer.from(JSON.stringify(payload)+'\n'),gzip=gzipSync(body,{level:9});
 const sum=k=>summaries.reduce((s,r)=>s+r[k],0);
 const summary={schema:'HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_QUALIFICATION_V1',contracts:37,
  total_raw_rows:sum('raw_rows'),qualified_closed_4h_rows:sum('qualified_closed_4h_rows'),forming_rows_excluded:sum('forming_excluded'),
  original_price_rows_preserved:priceRows,complete_derived_utc_days:sum('complete_derived_utc_days'),complete_derived_utc_weeks:sum('complete_derived_utc_weeks'),
  contracts_with_20_complete_derived_utc_weeks:summaries.filter(r=>r.has_20_complete_derived_weeks).length,
  qualified_archive:{path:'qualified-cohort.json.gz',bytes:gzip.length,sha256:sha256(gzip),uncompressed_bytes:body.length,uncompressed_sha256:sha256(body)},
  independent_inventory_rerun:false,old_normalizers_or_tests_executed:0,source_HTTP:0,native_SQL:0,production_imported:false,live_quote_eligible:false,decision_replay_eligible:false,entry_authorized:false,score_contribution:0,
  first_known_limitation:'Preserves original receipt.received_ts. Legacy collector set it before full body read; this is NOT a body completion / prospective causal ACK.',
  native_aggregation:'raw trade_turnover unchanged; both sides; no /2, face-value conversion, buy/sell inference, or contract-registry epoch assumption',
  rows:summaries};
 return {summary,gzip,payload};
}

export function saveCohort(result){
 fs.writeFileSync(path.join(here,'qualified-cohort.json.gz'),result.gzip);
 fs.writeFileSync(path.join(here,'qualification-summary.json'),JSON.stringify(result.summary,null,2)+'\n');
}
