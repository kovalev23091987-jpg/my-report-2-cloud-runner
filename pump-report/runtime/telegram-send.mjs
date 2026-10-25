import {automaticWindowOpen} from '../contracts/index.mjs';
const refused=code=>Object.assign(Error(code),{code,send_attempted:false});
export async function sendSavedTelegram({budget,fetch_impl,token,recipient,text,card,clock=Date.now}){
  const expired=()=>!Number.isSafeInteger(card?.expires_ts)||card.expires_ts<=clock()||card.mode==='AUTO'&&!automaticWindowOpen(clock());
  if(expired())throw refused('CARD_EXPIRED_BEFORE_TELEGRAM_RESERVE');
  let receipt;
  try{receipt=await budget.reserve({provider:'TELEGRAM',family:'DELIVERY',request_id:'TELEGRAM:'+card.card_id});}
  catch(error){error.send_attempted=false;throw error;}
  try{
    // A slow durable reservation must not turn a formerly valid card into a
    // stale send. Preserve the charge; no HTTP took place and nothing refunds.
    const http_started_ts=clock();
    if(!Number.isSafeInteger(card?.expires_ts)||card.expires_ts<=http_started_ts||card.mode==='AUTO'&&!automaticWindowOpen(http_started_ts)){
      await budget.finalize(receipt,{network_attempted:false});
      throw refused('CARD_EXPIRED_BEFORE_TELEGRAM_HTTP');
    }
    const response=await fetch_impl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,text,disable_web_page_preview:true}),redirect:'manual',signal:AbortSignal.timeout(15000)});
    let body=null;try{body=await response.json();}catch{}
    const http_ack_received_ts=clock();
    await budget.finalize(receipt,{http_status:response.status,network_attempted:true});
    return {ok:response.ok,status:response.status,body,http_started_ts,http_ack_received_ts,http_clock_basis:'CALL_TO_FETCH_AND_PARSED_ACK_NOT_WIRE_TIMESTAMP'};
  }catch(error){if(receipt.state==='RESERVED')await budget.finalize(receipt,{state:'UNKNOWN'});throw error;}
}
