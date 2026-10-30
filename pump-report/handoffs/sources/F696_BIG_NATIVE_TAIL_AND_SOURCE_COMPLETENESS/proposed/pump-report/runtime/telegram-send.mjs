import {automaticWindowOpen} from '../contracts/index.mjs';
import {assessPublicationMap} from '../analytics/zones.mjs';
import {START_PROFILE} from '../profile/start-v1.mjs';
export const TELEGRAM_HTTP_TIMEOUT_MS=15000;
const refused=code=>Object.assign(Error(code),{code,send_attempted:false});
export async function sendSavedTelegram({budget,fetch_impl,token,recipient,text,card,clock=Date.now,profile=START_PROFILE,native_tail=null,native_stage=null}){
  const expired=()=>!Number.isSafeInteger(card?.expires_ts)||card.expires_ts<=clock()||card.mode==='AUTO'&&!automaticWindowOpen(clock());
  const mapAt=at=>card?.analysis?.kind==='DELIVERY_DIAGNOSTIC'?{valid:true,map_mode:'WITHOUT_MAP',effective_deadline_ts:null,components_checked:0}:assessPublicationMap(card?.analysis,{at,profile});
  const mapEnough=(m,at)=>m.valid&&(m.effective_deadline_ts===null||m.effective_deadline_ts-at>=TELEGRAM_HTTP_TIMEOUT_MS);
  if(expired())throw refused('CARD_EXPIRED_BEFORE_TELEGRAM_RESERVE');
  if(!mapEnough(mapAt(clock()),clock()))throw refused('DISPLAYED_MAP_NOT_FRESH_FOR_TELEGRAM');
  let receipt;
  try{receipt=await budget.reserve({provider:'TELEGRAM',family:'DELIVERY',request_id:'TELEGRAM:'+card.card_id,native_stage});}
  catch(error){error.send_attempted=false;throw error;}
  try{
    // A slow durable reservation must not turn a formerly valid card into a
    // stale send. Preserve the charge; no HTTP took place and nothing refunds.
    const map=mapAt(clock()),http_started_ts=clock();
    if(!Number.isSafeInteger(card?.expires_ts)||card.expires_ts<=http_started_ts||card.mode==='AUTO'&&!automaticWindowOpen(http_started_ts)||!mapEnough(map,http_started_ts)){
      await budget.finalize(receipt,{native_stage,network_attempted:false});
      throw refused(!mapEnough(map,http_started_ts)?'DISPLAYED_MAP_EXPIRED_BEFORE_TELEGRAM_HTTP':'CARD_EXPIRED_BEFORE_TELEGRAM_HTTP');
    }
    if(native_tail)try{native_tail.beforeTelegram(native_stage);}catch(error){
      error.send_attempted=false;
      await budget.finalize(receipt,{native_stage,network_attempted:false});throw error;
    }
    const response=await fetch_impl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,text,disable_web_page_preview:true}),redirect:'manual',signal:AbortSignal.timeout(TELEGRAM_HTTP_TIMEOUT_MS)});
    let body=null;try{body=await response.json();}catch{}
    const http_ack_received_ts=clock();
    await budget.finalize(receipt,{native_stage,http_status:response.status,network_attempted:true});
    return {ok:response.ok,status:response.status,body,http_started_ts,http_ack_received_ts,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP',
      liquidation_freshness:{map_mode:map.map_mode,effective_deadline_ts:map.effective_deadline_ts,components_checked:map.components_checked,
        fresh_at_HTTP_start:true,fresh_at_ACK:map.effective_deadline_ts===null||http_ack_received_ts<=map.effective_deadline_ts}};
  }catch(error){if(receipt.state==='RESERVED')await budget.finalize(receipt,{native_stage,state:'UNKNOWN'});throw error;}
}
