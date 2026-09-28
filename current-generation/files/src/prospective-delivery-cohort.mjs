export const PROSPECTIVE_DELIVERY_COHORT_VERSION='prospective-delivery-cohort-v1-20260928';
const text=value=>String(value??'').trim();
const int=value=>value===null||value===undefined||value===''?null:Number.isSafeInteger(Number(value))?Number(value):null;
export function classifyDeliveryCohort({publication_id,wave_id,direction,telegram_dispatch_id=null,telegram_message_id=null,telegram_confirmed_ts=null,manual_delivery_ack_id=null,manual_confirmed_ts=null}={}){
 const publication=text(publication_id),wave=text(wave_id),side=text(direction).toUpperCase();
 const exact=publication!==''&&wave!==''&&['LONG','SHORT'].includes(side);
 const telegram=exact&&text(telegram_dispatch_id)!==''&&/^[1-9]\d*$/.test(text(telegram_message_id))&&int(telegram_confirmed_ts)!==null;
 const manual=exact&&text(manual_delivery_ack_id)!==''&&int(manual_confirmed_ts)!==null;
 return{version:PROSPECTIVE_DELIVERY_COHORT_VERSION,cohort_type:telegram?'TELEGRAM_CONFIRMED':manual?'MANUAL_CONFIRMED':'ANALYTICAL_PROSPECTIVE',outcome_wave_key:[wave||'NO_WAVE',side||'UNKNOWN',publication||'NO_PUBLICATION'].join('|'),delivery_channels:{telegram_confirmed:telegram,manual_confirmed:manual},one_wave_one_outcome:true};
}
export default{PROSPECTIVE_DELIVERY_COHORT_VERSION,classifyDeliveryCohort};
