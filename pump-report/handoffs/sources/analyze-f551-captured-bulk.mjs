// Offline CLI. Requires exact private fileSHA; writes coverage metadata only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {analyzeCapturedBulkPrices} from '../../sources/captured-bulk-price-coverage.mjs';
const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||args[i+1]===undefined)throw Error('KEY_VALUE_ARGUMENTS_REQUIRED');options[args[i].slice(2)]=args[i+1];}
for(const key of Object.keys(options))if(!['input','sha256','output','as-of'].includes(key))throw Error('UNKNOWN_ARGUMENT');
if(!options.input||!options.output||!/^[a-f0-9]{64}$/i.test(options.sha256??''))throw Error('INPUT_SHA256_OUTPUT_REQUIRED');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const scopePath=new URL('./U3_SELECTED_550_SYMBOLS_V1.txt',import.meta.url),scope=fs.readFileSync(scopePath);
const scopeSHA='5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920';
if(hash(scope)!==scopeSHA)throw Error('FROZEN550_SCOPE_SHA_MISMATCH');
const symbols=scope.toString('utf8').split('\n');if(symbols.at(-1)==='')symbols.pop();
if(symbols.length!==550)throw Error('FROZEN550_COUNT_MISMATCH');
const stat=fs.statSync(options.input);if(stat.size>8000000)throw Error('OFFLINE_CAPTURE_FILE_EXCEEDS8M_BYTES');
const bytes=fs.readFileSync(options.input),actual=hash(bytes);
if(actual!==options.sha256.toLowerCase())throw Error('PRIVATE_CAPTURE_SHA_MISMATCH');
if(fs.existsSync(options.output))throw Error('OUTPUT_ALREADY_EXISTS_NO_OVERWRITE');
const at=options['as-of']===undefined?Date.now():Number(options['as-of']);
let capture;
try { capture=JSON.parse(bytes.toString('utf8')); } catch { throw Error('CAPTURE_JSON_INVALID_NO_BODY_EXPORTED'); }
const result=analyzeCapturedBulkPrices({capture,expected_symbols:symbols,as_of_ts:at,sha256:hash,
  file_evidence:{capture_file_sha256:actual,capture_file_bytes:bytes.byteLength,scope_file_sha256:scopeSHA,
    as_of_basis:options['as-of']===undefined?'WALL_CLOCK_AT_OFFLINE_ANALYSIS':'EXPLICIT_REQUESTED_AS_OF_NOT_WALL_CLOCK'}});
fs.writeFileSync(options.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({schema:result.schema,capture_file_sha256:actual,output_sha256:hash(fs.readFileSync(options.output)),
  source_status:result.source_status,totals:result.totals,wire_body_bytes:result.payload_evidence.wire_body_bytes,
  strict_identity:result.strict_asset_identity.status,full_CORE:result.full_CORE.status,new_HTTP_SQL_TG:0}));
