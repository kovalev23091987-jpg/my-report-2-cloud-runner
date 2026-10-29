import {createHash} from 'node:crypto';

const sha=text=>createHash('sha256').update(text).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
const cardKey=id=>typeof id==='string'&&/^PUMP:[a-f0-9]{64}$/.test(id)?'pump:card:'+id:null;
export const OBSERVATION_BOUNDS=Object.freeze({card_page:20,selected_cards:1,selected_originals:1,rows_read:500,rows_written:30,queries:16,market_HTTP:0,Telegram:0});

// One bounded page, never a market scan or a replay of the analysis engine.
export async function readSavedAutoObservation({store,implementation_sha256,expected_recipient_sha256,clock=Date.now,after_key='pump:card:',include_executor=true,confirmed_not_before_ts=null}){
  if(!/^[a-f0-9]{64}$/.test(implementation_sha256??'')||!/^[a-f0-9]{64}$/.test(expected_recipient_sha256??'')||typeof after_key!=='string'||!after_key.startsWith('pump:card:')||after_key.length>100)throw Error('EXACT_OBSERVATION_CONTEXT_REQUIRED');
  if(typeof include_executor!=='boolean'||confirmed_not_before_ts!==null&&(!safeInt(confirmed_not_before_ts)||confirmed_not_before_ts>clock()))throw Error('DELIVERY_READ_SCOPE_REQUIRED');
  const read_started_ts=clock(),executor=include_executor?await store.get('pump:executor'):null;
  const run_id=executor?.run_id;
  if(run_id!==undefined&&(typeof run_id!=='string'||!/^[A-Za-z0-9:._-]{1,160}$/.test(run_id)))throw Error('SAVED_RUN_ID_UNBOUND');
  const run=run_id?await store.get('pump:run:'+run_id):null;
  const page=await store.scanPrefix('pump:card:',{after_key,limit:OBSERVATION_BOUNDS.card_page});
  const candidates=page.filter(r=>r.value?.state==='SENT'&&r.value.mode==='AUTO'&&r.value.analysis?.run_purpose==='PRODUCTION'&&
    (confirmed_not_before_ts===null||safeInt(r.value.receipt?.confirmed_ts)&&r.value.receipt.confirmed_ts>=confirmed_not_before_ts));
  const result={schema:'PUMP_SAVED_AUTO_OBSERVATION_V1',read_started_ts,observed_ts:clock(),implementation_sha256,
    scope:{cards_read:page.length,limit:OBSERVATION_BOUNDS.card_page,after_key,next_after_key:page.at(-1)?.key??after_key,page_exhausted:page.length<OBSERVATION_BOUNDS.card_page,whole_history_claimed:false,whole_market_claimed:false,executor_context_requested:include_executor,confirmed_not_before_ts},
    latest_executor_status:!include_executor?'NOT_READ_DELIVERY_ONLY':executor?.owner?'IN_PROGRESS':run?'COMPLETED_RUN_AVAILABLE':'NO_COMPLETED_RUN_AVAILABLE',
    latest_run_id:run_id??null,latest_run_status:run?.status??null,
    first_genuine_same_original_SENT_observed:false,status:'NO_PRODUCTION_AUTO_SENT_IN_READ_SCOPE',
    private_evidence:{executor,run,card:null,original:null},market_HTTP:0,Telegram:0};
  candidates.sort((a,b)=>(a.value.receipt?.confirmed_ts??Infinity)-(b.value.receipt?.confirmed_ts??Infinity));
  const chosen=candidates[0];if(!chosen)return result;
  const key=cardKey(chosen.value.card_id);if(!key||chosen.key!==key)throw Error('CARD_ID_KEY_UNBOUND');
  const card=await store.get(key),analysis_key=card?.analysis?.source_input_key;
  if(card?.card_id!==chosen.value.card_id||cardKey(card?.card_id)!==key)throw Error('SENT_CARD_ID_CHANGED_AFTER_PAGE_READ');
  if(card?.state!=='SENT'||card.mode!=='AUTO'||!/^pump:analysis:[a-f0-9]{64}$/.test(analysis_key??''))throw Error('SENT_CARD_ORIGINAL_REFERENCE_UNBOUND');
  const original=await store.get(analysis_key);result.private_evidence.card=card;result.private_evidence.original=original;result.observed_ts=clock();
  if(original?.implementation_sha256!==implementation_sha256){result.status='SENT_OTHER_IMPLEMENTATION_NOT_CURRENT_PROOF';return result;}
  const {source_input_key,...savedAnalysis}=card.analysis,receipt=card.receipt;
  const a=original.analysis,i=original.input;
  const originalExpiry=Math.min(...['price','candles','orderbook'].map(k=>i?.facts?.[k]?.expires_ts));
  const sameOriginal=Boolean(a&&i&&original.evidence_class==='OBSERVED'&&a.ready===true&&a.automatic_eligible===true&&
    a.mode==='AUTO'&&i.mode==='AUTO'&&a.run_purpose==='PRODUCTION'&&i.run_purpose==='PRODUCTION'&&
    a.run_id===i.run_id&&equal(a.instrument,i.instrument)&&a.analysis_ts===i.analysis_ts&&
    !['BTC','ETH'].includes(a.instrument?.base)&&
    analysis_key==='pump:analysis:'+sha(JSON.stringify(a))&&equal(savedAnalysis,a)&&
    card.text===a.card_text&&card.text_hash===sha(card.text)&&
    safeInt(a.analysis_ts)&&safeInt(original.saved_ts)&&a.analysis_ts<=original.saved_ts&&
    safeInt(card.created_ts)&&original.saved_ts<=card.created_ts&&card.created_ts<=card.send_started_ts);
  const boundReceipt=Boolean(receipt&&receipt.card_id===card.card_id&&receipt.text_hash===card.text_hash&&
    typeof card.recipient==='string'&&card.recipient.length>0&&card.recipient!=='UNCONFIGURED'&&sha(card.recipient)===expected_recipient_sha256&&receipt.recipient===card.recipient&&
    /^[1-9][0-9]*$/.test(String(card.message_id??''))&&String(receipt.message_id)===String(card.message_id)&&
    safeInt(card.send_started_ts)&&safeInt(card.expires_ts)&&safeInt(originalExpiry)&&card.expires_ts<=originalExpiry&&
    safeInt(receipt.http_started_ts)&&card.send_started_ts<=receipt.http_started_ts&&receipt.http_started_ts<card.expires_ts&&
    safeInt(receipt.http_ack_received_ts)&&receipt.http_started_ts<=receipt.http_ack_received_ts&&
    safeInt(receipt.confirmed_ts)&&receipt.http_ack_received_ts<=receipt.confirmed_ts&&receipt.confirmed_ts<=result.observed_ts&&
    receipt.http_clock_basis==='CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP');
  result.checks={same_original:sameOriginal,receipt_bound:boundReceipt,original_implementation_bound:true};
  result.first_genuine_same_original_SENT_observed=sameOriginal&&boundReceipt;
  result.status=result.first_genuine_same_original_SENT_observed?'OBSERVED_SAME_ORIGINAL_PRODUCTION_AUTO_SENT':'SAVED_SENT_BINDING_MISMATCH';
  result.analysis_key=analysis_key;result.card_id=card.card_id;
  // A finding in this page proves one delivery, never a global earliest/count.
  return result;
}
