// A positive acknowledgement must identify an actual Telegram message.
export function confirmedTelegramMessageId(value){
 if(typeof value==='number')return Number.isSafeInteger(value)&&value>0?String(value):null;
 if(typeof value!=='string'||!/^[1-9][0-9]*$/.test(value))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>0?value:null;
}
export function confirmedRelayReceipt(body){
 const id=confirmedTelegramMessageId(body?.message_id);
 return body?.ok===true&&(body.status==null||body.status==='SENT')&&id?{message_id:id}:null;
}
