// One admitted local projection of a saved native result. No imports from the engine or network.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const [admissionPath]=process.argv.slice(2),a=JSON.parse(fs.readFileSync(admissionPath,'utf8'));
if(a.status!=='ADMITTED_ONE_LOCAL_PROJECTION'||Date.now()>=a.expires_ts||a.network!==0||a.native_SQL!==0||a.Telegram!==0||
  sha(fs.readFileSync(fileURLToPath(import.meta.url)))!==a.operator_sha256)throw Error('EXACT_LOCAL_PROJECTION_ADMISSION_REQUIRED');
const raw=fs.readFileSync(a.private_input_file);
if(raw.length>12582912||raw.length!==a.private_input_bytes||sha(raw)!==a.private_input_sha256)throw Error('PRIVATE_INPUT_HASH_REQUIRED');
const e=JSON.parse(raw),o=e.observation,r=o?.private_evidence?.run,c=e.latest_auto_candidate,card=o?.private_evidence?.card;
const snapshot=e.catalog_snapshot?.private_evidence?.snapshot;
const pin=a.implementation_sha256,original=c?.private_evidence?.original;
const p=original?.analysis;
const cardRun=card?.analysis?.run_id,cardKey=card?.analysis?.source_input_key;
const same=Boolean(o?.first_genuine_same_original_SENT_observed&&c?.saved_original_bound&&
  cardRun===p?.run_id&&p?.run_id===o.latest_run_id&&cardKey===c.analysis_key&&
  card?.analysis?.instrument?.instrument_id===p?.instrument?.instrument_id);
const at=Date.now(),day=new Date(e.completed_ts).toISOString().slice(0,10),month=day.slice(0,7),resources=e.project_resources;
const result={schema:'ROOT_NATIVE_AUTO_OBSERVATION_SUMMARY_V1',recorded_ts:at,private_input_sha256:sha(raw),private_input_bytes:raw.length,
  execution_state:e.state,error:e.error??null,read_run_id:e.run_id,implementation_sha256:e.implementation_sha256,
  requested_pin_matches:e.implementation_sha256===pin,completed_ts:e.completed_ts,native_API_attempts:e.native_api_calls_attempted,
  native_receipt:e.native_receipt??null,market_HTTP:e.market_HTTP,Telegram:e.Telegram,
  delivery_observation:{status:o?.status??null,one_current_same_original_SENT:o?.first_genuine_same_original_SENT_observed===true,
    card_run_id:cardRun??null,card_analysis_key:cardKey??null,instrument_id:card?.analysis?.instrument?.instrument_id??null,
    message_id:card?.message_id??null,checks:o?.checks??null,latest_candidate_joint_delivery:same},
  latest_saved_run:r?{run_id:r.run_id,status:r.status,discovery_result:r.discovery_result,checked:(r.checked??[]).map(x=>({analysis_key:x.analysis_key,
    instrument_id:x.analysis?.instrument?.instrument_id??null,ready:x.analysis?.ready??null,reasons:x.analysis?.reasons??[],delivery_state:x.delivery?.state??null})),
    deferred:(r.deferred??[]).map(x=>({instrument_id:x.instrument_id,reason:x.source_coverage?.reason??x.reason??null})),
    errors:r.errors??[],catalog_coverage:r.catalog_coverage,source_evidence_coverage:r.source_evidence_coverage,
    candidate_selection:r.candidate_selection??[],candidate_selection_truncated:r.candidate_selection_truncated??null}:null,
  selected_original:{status:c?.status??null,bound:c?.saved_original_bound===true,analysis_key:c?.analysis_key??null,
    instrument_id:p?.instrument?.instrument_id??null,analysis_ts:p?.analysis_ts??null,ready:p?.ready??null,reasons:p?.reasons??[],
    wave_state:p?.wave_state??null,current_threshold_passed:p?.current_threshold_passed??null,plan_minimum_potential_pct:p?.plan?.potential_pct?.minimum??null,
    mandatory_fact_metadata:c?.mandatory_fact_metadata??null},
  catalog:{status:e.catalog_snapshot?.status??null,source_response_bound:e.catalog_snapshot?.native_source_response_bound===true,
    row_count:e.catalog_snapshot?.row_count??null,snapshot_json_sha256:snapshot?sha(JSON.stringify(snapshot)):null,
    body_sha256:snapshot?.body_sha256??null,implementation_sha256:snapshot?.implementation_sha256??null,
    receipt_id:snapshot?.receipt_id??null,received_ts:snapshot?.received_ts??null,saved_ts:snapshot?.saved_ts??null,
    observed_ts:e.catalog_snapshot?.observed_ts??null,as_of_ts:at,current_global_crypto_N_proven:false},
  resources_at_read:resources?{day,project_day_spent:resources.days?.[day]??null,BINGX_day_spent:resources.providers?.BINGX?.days?.[day]??null,
    BINGX_month_spent:resources.providers?.BINGX?.months?.[month]??null,whole_account_day_usage_claimed:false}:null};
fs.writeFileSync(a.output_file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({output_file:a.output_file,state:e.state,one_current_same_original_SENT:result.delivery_observation.one_current_same_original_SENT,
  catalog_status:result.catalog.status,native_receipt:e.native_receipt??null})+'\n');
