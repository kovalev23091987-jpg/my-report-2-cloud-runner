import crypto from 'node:crypto';
import {BLOCKS} from './evidence-v2.mjs';
import {renderCanonicalTelegram,CANONICAL_PUBLICATION_VERSION} from './canonical-publication.mjs';

export const EXACT_SAVED_RUN_TELEGRAM_VERSION='exact-saved-run-telegram-v2-approved-layout-20261005';
const text=v=>v===null||v===undefined?'':String(v).trim();
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const sha256=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const changes=r=>{for(const value of [r?.meta?.changes,r?.changes,r?.meta?.rows_written,r?.rows_written]){const n=Number(value);if(Number.isFinite(n))return n;}return null;};
const rows=r=>Array.isArray(r)?r:(Array.isArray(r?.results)?r.results:(Array.isArray(r?.result)?r.result:[]));
async function sendRelay({relay_url,relay_key,message,fetch_impl=globalThis.fetch,timeout_ms=8000}={}){const url=text(relay_url),key=text(relay_key),body=text(message);if(!url||!key||!body)return{network_result:'CONFIG_ERROR',status:'RELAY_NOT_CONFIGURED',message_id:null};const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout_ms);try{const response=await fetch_impl(url,{method:'POST',headers:{'content-type':'application/json; charset=UTF-8',authorization:`Bearer ${key}`},body:JSON.stringify({text:body}),signal:controller.signal});let payload=null;try{payload=await response.json();}catch{}if(response.ok&&payload?.ok===true)return{network_result:'CONFIRMED_SENT',status:text(payload.status)||'SENT',message_id:payload.message_id??null,http_status:response.status};if(payload?.ok===false)return{network_result:'REJECTED',status:text(payload.status)||'RELAY_REJECTED',message_id:null,http_status:response.status};return{network_result:response.status>=500?'5XX':'UNKNOWN',status:response.status>=500?'RELAY_5XX':'AMBIGUOUS_RELAY_RESPONSE',message_id:null,http_status:response.status};}catch(error){return{network_result:error?.name==='AbortError'?'TIMEOUT':'NETWORK_ERROR',status:error?.name==='AbortError'?'RELAY_TIMEOUT':'NETWORK_ERROR',message_id:null};}finally{clearTimeout(timer);}}

function candidateContract(c){return text(c?.contract||c?.contract_code||c?.canonical?.contract);}
function candidateCoverageAccounted(c){
 const a=c?.block_coverage,usage=c?.block_decision_use,ids=usage?.participating_block_ids;
 const fullLegacy=a?.status==='CLOSED_ALL_15_CHECKED'&&a?.all_blocks_checked===true&&Number(a?.coverage_count)===15&&Number(a?.checked_block_count)===15;
 const bound=usage?.schema==='report2-block-decision-use-audit-v2-same-run-assessments'&&usage.run_id===c.run_id&&usage.snapshot_id===c.snapshot_id&&usage.contract===candidateContract(c)&&usage.decision_ts===c.observed_ts&&Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>BLOCKS[id]&&usage.blocks?.[id]?.participating===true)&&usage.participating_block_count===ids.length&&Object.entries(usage.blocks||{}).filter(([,r])=>r.participating===true).length===ids.length;
 const accounted=a?.coverage_count===15&&Object.keys(BLOCKS).every(id=>typeof a.blocks?.[id]?.status==='string'&&a.blocks[id].source_statuses&&a.blocks[id].source_checks);
 return fullLegacy||bound&&accounted;
}
function noCalculatedLiquidations(c){const l=c?.canonical?.liquidations||{};return l.calculated_fallback_enabled===false&&Number(l.calculated_zone_count||0)===0&&!(Array.isArray(l.all_zones)&&l.all_zones.some(z=>String(z?.kind||'').toUpperCase()==='CALCULATED'));}
function displayView(c){const canonical=c.canonical||{};return {...canonical,contract:candidateContract(c),snapshot_time_utc:new Date(Number(c.observed_ts||canonical.observed_ts)).toISOString(),candidates:[{contract:candidateContract(c),ticker:candidateContract(c)}],metadata:{...(canonical.metadata||{}),contract:candidateContract(c)}};}

export function validateExactSavedRunTelegram({saved_output,requested_run_id,now_ts=Date.now()}={}){
 const fail=reason=>({ok:false,status:'NOT_CLOSED',reason,candidate:null,rendered:null});
 const output=saved_output||{},run=text(requested_run_id);
 if(!run||text(output.run_id)!==run)return fail('SAVED_RUN_ID_MISMATCH');
 if(output.status!=='CLOSED'||output.reason!==null)return fail('SAVED_RUN_NOT_CLOSED');
 if(output.secrets_included!==false||output.alternative_manual_recalculation!==false)return fail('SAVED_RUN_PROVENANCE_NOT_CLOSED');
 const scan=output.market_scan_audit||{};if(scan.complete!==true||Number(scan.universe_total)!==102||Number(scan.scanned)!==102||Number(scan.errors)!==0||Number(scan.stale)!==0)return fail('MARKET_SCAN_NOT_CLOSED');
 const selection=output.candidate_selection_audit||{},top=Array.isArray(selection.top_two_contracts)?selection.top_two_contracts.map(text):[],deep=Array.isArray(selection.deep_check_selected)?selection.deep_check_selected.map(text):[];
 if(top.length!==2||JSON.stringify(top)!==JSON.stringify(deep)||selection.registry_did_not_change_rank!==true)return fail('TOP_TWO_BINDING_NOT_CLOSED');
 const candidates=Array.isArray(output.candidates)?output.candidates:[];if(candidates.length!==2||!candidates.every(c=>text(c.run_id||c?.canonical?.run_id)===run&&top.includes(candidateContract(c))&&candidateCoverageAccounted(c)&&noCalculatedLiquidations(c)))return fail('CANDIDATE_ACCEPTANCE_NOT_CLOSED');
 const observed=candidates.filter(c=>c?.canonical?.status==='CLOSED'&&c?.canonical?.state==='OBSERVE'&&['LONG','SHORT'].includes(text(c?.canonical?.direction).toUpperCase())&&finite(c?.canonical?.scores?.coin_interest_0_100)>=70&&c?.canonical?.data_quality?.owner_deferred_exact_signed_raw24h===true);
 if(observed.length!==1)return fail('EXACTLY_ONE_OWNER_DEFERRED_OBSERVATION_REQUIRED');
 const candidate=observed[0],valid=finite(candidate.valid_until_ts||candidate?.canonical?.trigger?.expires_ts);if(valid===null||valid<Number(now_ts))return fail('SAVED_OBSERVATION_EXPIRED');
 // The compact formatter is an internal surface, not the approved sender.
 // Reuse the established publication renderer without changing canonical data.
 const rendered=renderCanonicalTelegram({canonical:displayView(candidate),lifecycle_event:'OBSERVE'});if(rendered.ok!==true)return fail(`APPROVED_RENDERER_${rendered.status||'FAILED'}`);
 return {ok:true,status:'CLOSED',reason:null,candidate,rendered:{...rendered,message:rendered.text,formatter:CANONICAL_PUBLICATION_VERSION,message_hash:sha256(rendered.text)}};
}

export async function deliverExactSavedRunTelegram({db,saved_output,requested_run_id,enabled=false,relay_url=null,relay_key=null,now_ts=Date.now(),fetch_impl=globalThis.fetch}={}){
 const base={schema:'exact-saved-run-telegram-proof-v1',version:EXACT_SAVED_RUN_TELEGRAM_VERSION,run_id:text(requested_run_id),network_enabled:enabled===true,validated_signal:false,trading_execution:false};
 if(enabled!==true)return {...base,status:'NETWORK_DISABLED_FAIL_CLOSED',sent:false};
 if(!db?.prepare)return {...base,status:'SOURCE_UNSUPPORTED',sent:false};
 const gate=validateExactSavedRunTelegram({saved_output,requested_run_id,now_ts});if(!gate.ok)return {...base,status:gate.status,reason:gate.reason,sent:false};
 const acceptedBase={...base,validated_signal:true};
 const c=gate.candidate,dispatch_key=`canonical-saved-run:${requested_run_id}:${c.snapshot_id}:${gate.rendered.message_hash}`,source_ref=`${requested_run_id}|${c.snapshot_id}|${c.publication_id}`,claimToken=`CLAIM:${crypto.randomUUID()}`;
 const readReservation=async()=>rows(await db.prepare(`SELECT status,message_hash,telegram_message_id,telegram_http_status,error_text FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatch_key).all())[0]||null;
 const inserted=await db.prepare(`INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2 (dispatch_key,category,source_ref,status,reserved_ts,updated_ts,message_hash,telegram_message_id,telegram_http_status,error_text) VALUES (?1,'WATCH70_CANDIDATE',?2,'RESERVED',?3,?3,?4,NULL,NULL,?5)`).bind(dispatch_key,source_ref,Number(now_ts),gate.rendered.message_hash,claimToken).run();
 let reservation=await readReservation(),owned=reservation?.status==='RESERVED'&&reservation?.message_hash===gate.rendered.message_hash&&reservation?.error_text===claimToken;
 if(!owned&&reservation?.status==='RESERVED'&&reservation?.message_hash===gate.rendered.message_hash&&!text(reservation?.telegram_message_id)&&!text(reservation?.error_text)){
   await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET updated_ts=?2,error_text=?3 WHERE dispatch_key=?1 AND status='RESERVED' AND telegram_message_id IS NULL AND error_text IS NULL`).bind(dispatch_key,Number(now_ts),claimToken).run();reservation=await readReservation();owned=reservation?.status==='RESERVED'&&reservation?.message_hash===gate.rendered.message_hash&&reservation?.error_text===claimToken;
 }
 if(!owned){if(reservation?.status==='SENT'&&text(reservation.telegram_message_id)&&reservation.message_hash===gate.rendered.message_hash)return {...acceptedBase,status:'SENT',sent:true,reused:true,message_id:String(reservation.telegram_message_id),http_status:reservation.telegram_http_status??null,dispatch_key,source_ref,contract:candidateContract(c),snapshot_id:c.snapshot_id,publication_id:c.publication_id,formatter:gate.rendered.formatter,message_hash:gate.rendered.message_hash};return {...acceptedBase,status:'NOT_SENT',reason:reservation?.error_text||reservation?.status||`RESERVATION_NOT_ACQUIRED:${changes(inserted)}`,sent:false,dispatch_key,source_ref};}
 const net=await sendRelay({relay_url,relay_key,message:gate.rendered.message,fetch_impl});const confirmed=net.network_result==='CONFIRMED_SENT'&&text(net.message_id);
 if(confirmed)await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET status='SENT',updated_ts=?2,telegram_message_id=?3,telegram_http_status=?4,error_text=NULL WHERE dispatch_key=?1 AND status='RESERVED'`).bind(dispatch_key,Date.now(),String(net.message_id),net.http_status??null).run();
 else if(['REJECTED','CONFIG_ERROR','RENDER_ERROR'].includes(text(net.network_result)))await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET status='SEND_FAILED',updated_ts=?2,telegram_http_status=?3,error_text=?4 WHERE dispatch_key=?1 AND status='RESERVED'`).bind(dispatch_key,Date.now(),net.http_status??null,text(net.status)||'SEND_FAILED').run();
 else await db.prepare(`UPDATE telegram_output_dispatch_journal_v2 SET updated_ts=?2,telegram_http_status=?3,error_text=?4 WHERE dispatch_key=?1 AND status='RESERVED'`).bind(dispatch_key,Date.now(),net.http_status??null,`DELIVERY_UNKNOWN:${text(net.status)||'MISSING_POSITIVE_MESSAGE_ID'}`).run();
 const readback=rows(await db.prepare(`SELECT status,message_hash,telegram_message_id,telegram_http_status,error_text FROM telegram_output_dispatch_journal_v2 WHERE dispatch_key=?1 LIMIT 1`).bind(dispatch_key).all())[0]||null;const sent=readback?.status==='SENT'&&text(readback.telegram_message_id)&&readback.message_hash===gate.rendered.message_hash;
 return {...acceptedBase,status:sent?'SENT':'NOT_SENT',sent:Boolean(sent),reused:false,message_id:sent?String(readback.telegram_message_id):null,http_status:readback?.telegram_http_status??null,error:sent?null:(readback?.error_text||net.status||'DELIVERY_NOT_CONFIRMED'),dispatch_key,source_ref,contract:candidateContract(c),snapshot_id:c.snapshot_id,publication_id:c.publication_id,formatter:gate.rendered.formatter,message_hash:gate.rendered.message_hash,secrets_logged:false};
}

export default{EXACT_SAVED_RUN_TELEGRAM_VERSION,validateExactSavedRunTelegram,deliverExactSavedRunTelegram};
