import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditRetainedHtxHistoryCoverage as audit} from '../runner/retained102-history-gap-census.mjs';
import {planHtxColdHistoryBackfill as plan} from '../runner/htx-cold-history-backfill-plan.mjs';

const universe=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
const sampled=JSON.parse(fs.readFileSync('checkpoints/APPROVED102_ORIGINAL24H_ASSEMBLED_READER_REPLAY_20261009.json'));
const native=JSON.parse(fs.readFileSync('checkpoints/NATIVE_FULL_DAY_PRICE_HISTORY_CONNECTED_20261009.json'));
const binance=JSON.parse(fs.readFileSync('checkpoints/MONTHLY_COLD_PRICE_HISTORY_CONNECTED_20261009.json'));
const census=audit({universe,sampled,native,binance});
const original=JSON.parse(fs.readFileSync('checkpoints/ACTUAL_HTX_COLD_HISTORY_BATCH_20261010.json'));
const digest=createHash('sha256').update(fs.readFileSync(original.retained_zip)).digest('hex');
if(original.status!=='THREE_ACTUAL_OFFICIAL_ARCHIVE_PAIRS_RETAINED_CHECKSUM_AND_GRID_VERIFIED'||
  original.source_run!==38038404724||original.verified_archive_pairs!==3||original.sourceHTTP!==6||
  original.native_api_ohlc_crosschecked!==false||original.price_qualified!==false||
  original.source_artifact_sha256!==digest||
  original.contracts?.length!==3||new Set(original.contracts).size!==3)throw Error('EXACT_RETAINED_ACTUAL_HTX_ARCHIVE_RECEIPT_REQUIRED');

const verified=[{contract:native.prices.contract,archive_day:native.prices.day,status:'CLOSED_PRICE_HISTORY'},
  ...original.contracts.map(contract=>({contract,archive_day:original.archive_day,status:'CHECKSUM_AND_1440_MINUTE_GRID_VERIFIED_PRICE_API_NOT_CROSSCHECKED'}))];
const result=plan({census,window_end_day:native.prices.day,window_days:30,verified,source_http_reservation:6});
if(result.status!=='BOUNDED_ACQUISITION_PLAN_CLOSED'||result.planned_slots!==3||
  result.verified_slots!==4||result.planned_source_http!==6||result.sourceHTTP!==0||
  result.planned.some(x=>verified.some(y=>x.contract===y.contract&&x.archive_day===y.archive_day)))
  throw Error('ACTUAL_RETAINED_ARCHIVES_MUST_ROTATE_WITHOUT_REDUNDANT_HTTP');

fs.mkdirSync('audit-output',{recursive:true});
fs.writeFileSync('audit-output/htx-cold-history-backfill-next-plan.json',JSON.stringify({
 ...result,head:process.env.GITHUB_SHA??null,cloud_run:Number(process.env.GITHUB_RUN_ID)||null,
 actual_verified_receipts:verified,original_source_artifact_sha256:digest,
 scope:'NEXT_PLAN_ONLY_AFTER_ACTUAL_THREE_ARCHIVES;NO_SOURCE_OR_D1_CALLS;NOT_PRICE_QUALIFIED'
},null,2)+'\n');
console.log(JSON.stringify({status:result.status,assets:result.assets,verified_archive_slots:result.verified_slots,
 planned_slots:result.planned_slots,planned_source_http:result.planned_source_http,
 planned_contracts:result.planned.map(x=>x.contract),sourceHTTP:0,project_complete:false}));
