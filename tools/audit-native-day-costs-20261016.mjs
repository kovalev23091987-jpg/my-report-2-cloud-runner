import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {exactSavedTailReceipts,reconcileSavedNativePointCosts,qualifyExistingFamilyInventory} from '../runner/disjoint-native-day-accounting.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const SAVED_NATIVE_DAY_INPUTS=Object.freeze([
 {path:'checkpoints/free-storage-20261016/native-tail-38888867181.json',sha256:'4b0e8c8e8c989a8e3f0d77551acdfef631f0eababd61051d8d5ad09ccd31765e'},
 {path:'checkpoints/free-storage-20261016/native-tail-38894299195.json',sha256:'e664cc7df7f32242599c8c5002c29d77eea2e260d40821a05a27763f7ad45c84'}
]);
export function auditSavedNativeDayCosts({root=process.cwd(),output=null}={}){
 const inputs=SAVED_NATIVE_DAY_INPUTS.map(item=>({...item,text:fs.readFileSync(path.join(root,item.path),'utf8')}));
 const points=reconcileSavedNativePointCosts(inputs.flatMap(exactSavedTailReceipts));
 const inventoryPath='checkpoints/ACTIVE105_D1_FAMILY_INVENTORY_20261015.json',inventoryBytes=fs.readFileSync(path.join(root,inventoryPath)),inventory=JSON.parse(inventoryBytes);
 const envelope=qualifyExistingFamilyInventory(inventory);
 const source_hash_review=inventory.source_files.map(f=>{const current_sha256=hash(fs.readFileSync(path.join(root,f.path)));return{path:f.path,inventory_sha256:f.sha256,current_sha256,unchanged_since_inventory:current_sha256===f.sha256};});
 const fixturePath='current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs',bridge=fs.readFileSync(path.join(root,fixturePath));
 const out={schema:'SAVED_NATIVE_DAY_ACCOUNTING_AUDIT_V1',status:'NOT_CLOSED_NATIVE_POINTS_AND_PLANNED_ENVELOPES_ARE_DISTINCT',inputs:inputs.map(({text,...v})=>v),existing_inventory:{path:inventoryPath,sha256:hash(inventoryBytes),...envelope},source_hash_review,observed_native_points:points,
  bridge_contract_limit:{retained_fixture:fixturePath,sha256:hash(bridge),either_counter_can_mark_fixture_measured:bridge.toString().includes('Number.isFinite(rr) || Number.isFinite(rw)'),current_installed_bridge_requalified:false,old_fixture_does_not_prove_current_installed_metadata_contract:true},
  nominal_storage_plan:{ordinary_slots_day:2,rows_per_slot:48,nominal_capacity:96,planned_incoming_rows:144,manual_reserve_incoming_rows:188,scheduled_nominal_deficit:48,with_manual_nominal_deficit:92,proposal_minimum_slots_for188:4,proposal_extra_reserved_reads:10000,proposal_extra_reserved_writes:800,proposal_enabled:false,native_throughput_qualified:false},
  unresolved:['All collector callback paths including duplicate/no-op/error/reclaimed/late finalization need qualified day envelopes; one observed sample cannot provide them.','Hourly source/archive point cost does not bound every missing/partial/storage-guard/run-log cleanup path.','Control SQL, late finalization after a finalized reservation and unknown failed work must be allocated without refunds.','Native per-query partial-counter provenance through the currently installed bridge remains unqualified.','UTC16 unknown costs and both spent maintenance slots remain unchanged.'],
  runtime_or_admission_changed:false,whole_day_closed:false,daily_total:null,daily_upper_bound:null,sourceHTTP:0,SQL:0,MAIN:0,Telegram:0};
 if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');}return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const out=auditSavedNativeDayCosts({output:path.resolve('audit-output/liq-assembled/saved-native-day-accounting.json')});
 console.log(JSON.stringify({status:out.status,known_nine_family_envelopes:out.existing_inventory.known_nine_family_envelopes,observed_days:out.observed_native_points.observed_days,whole_day_closed:false,sourceHTTP:0,SQL:0}));
}
