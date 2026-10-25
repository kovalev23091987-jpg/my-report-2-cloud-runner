import fs from 'node:fs';
import crypto from 'node:crypto';
import {generateSavedNativeBindingProposals,createProposalAwareIdentityResolver} from '../../sources/native-binding-proposals.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const base=new URL('./',import.meta.url);
const load=(url,expected)=>{const bytes=fs.readFileSync(url);if(sha(bytes)!==expected)throw Error('PINNED_INPUT_SHA_MISMATCH');return bytes;};
const scopeSHA='5e5610a579142fd19d2448b4d1834fe75498b8b4263ea41435ebd71b52b31920';
const economicSHA='540111a3d30a4a76064b1124a8d904864a4c52f051642f75e83cbc3ca0559057';
const catalogSHA='7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5';
const symbols=load(new URL('U3_SELECTED_550_SYMBOLS_V1.txt',base),scopeSHA).toString('utf8').split('\n');if(symbols.at(-1)==='')symbols.pop();
if(symbols.length!==550)throw Error('FROZEN550_REQUIRED');
const scope=JSON.parse(load(new URL('U3_FULL_934_SCOPE_SELECTION_V1.json',base),economicSHA));
const native=JSON.parse(load('/private/tmp/pump-report-native-catalog-corrected.json',catalogSHA)).body.response.data.data;
const bundle=generateSavedNativeBindingProposals({native_rows:native,scope_rows:scope.rows,expected_symbols:symbols,sha256:sha,evidence:{
  catalog_file_sha256:catalogSHA,economic_scope_file_sha256:economicSHA,selected_symbols_file_sha256:scopeSHA,
  catalog_original_received_ts:1792931870932,catalog_endpoint:'/openApi/swap/v2/quote/contracts',
  contract_semantics_evidence_ref:'BINGX_OFFICIAL_CATALOG_DOCSV3_SHA256:9d9da7824d7fd091187e9b5dbed8e79d0fb6d2ab00b4efb7b2762eedc5272b2f',
  economic_evidence_kind:'OWNER_ACCEPTED_PRACTICAL_ECONOMIC_SCOPE_WITH_EXPLICIT_INFERENCE_NOT_UNIVERSAL_ENUM',
  owner_relative_basis_ref:'checkpoints/pump-report-20261025/OWNER_CANDLE_SEMANTICS_ACCEPTED.json'}});
if(bundle.proposed!==550||bundle.blocked!==0||bundle.auto_VERIFIED_CRYPTO!==0)throw Error('SAVED_BINDING_RECONCILIATION_FAILED');
const oldPath=new URL('../../sources/registry-curated13-native-relative-v1.json',import.meta.url),oldBytes=fs.readFileSync(oldPath),old=JSON.parse(oldBytes);
const resolver=createProposalAwareIdentityResolver({existing_entries:old.instruments,proposal_bundle:bundle});
let existingInScope=0;
for(const symbol of symbols)if(resolver.resolve({native_symbol:symbol}))existingInScope++;
if(existingInScope!==11||old.instruments.length!==13)throw Error('RETAINED13_OR_SCOPE11_CHANGED');
bundle.existing_retained_registry={sha256:sha(oldBytes),entries:13,owner_eligible_in_scope:11,rewritten:false};
bundle.default_resolver_summary=resolver.summary();
bundle.default_scope_resolved=existingInScope;
bundle.no_HTTP_SQL_TG_deploy=true;
fs.writeFileSync(new URL('F552_PROPOSED_NATIVE_BINDINGS_550_V1.json',base),JSON.stringify(bundle)+'\n');
console.log(JSON.stringify({proposals:bundle.proposed,blocked:bundle.blocked,auto_VERIFIED_CRYPTO:0,existing13_unchanged:true,default_scope_resolved:existingInScope,new_native_IO:0}));
