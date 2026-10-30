import fs from 'node:fs';
import crypto from 'node:crypto';
import {generateSavedNonTargetDecisions} from '../../sources/saved-nontarget-decisions.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),base=new URL('./',import.meta.url);
const economicSHA='540111a3d30a4a76064b1124a8d904864a4c52f051642f75e83cbc3ca0559057',catalogSHA='7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5';
const eb=fs.readFileSync(new URL('U3_FULL_934_SCOPE_SELECTION_V1.json',base)),nb=fs.readFileSync('/private/tmp/pump-report-native-catalog-corrected.json');
if(sha(eb)!==economicSHA||sha(nb)!==catalogSHA)throw Error('FROZEN_NEGATIVE_INPUT_SHA_MISMATCH');
const bundle=generateSavedNonTargetDecisions({scope_rows:JSON.parse(eb).rows,native_rows:JSON.parse(nb).body.response.data.data,
  evidence:{catalog_file_sha256:catalogSHA,economic_scope_file_sha256:economicSHA,catalog_original_received_ts:1792931870932},sha256:sha});
if(bundle.count!==380||bundle.blocked.length)throw Error('SAVED380_NEGATIVE_RECONCILIATION_FAILED');
fs.writeFileSync(new URL('F552_KNOWN_NON_TARGET_380_V1.json',base),JSON.stringify(bundle)+'\n');
console.log(JSON.stringify({known_saved_non_target:380,blocked:0,index_patch_applied:false,new_native_IO:0}));
