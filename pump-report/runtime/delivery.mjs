import {BudgetRefusal} from './budget.mjs';
import {automaticWindowOpen,ownerPublicationRefusal} from '../contracts/index.mjs';
import {textHash} from './text-hash.mjs';
import {createWorkIndex} from './work-index.mjs';
export {automaticWindowOpen} from '../contracts/index.mjs';
export {textHash} from './text-hash.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const positiveMessageId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&/^[1-9][0-9]*$/.test(String(id));

export function createDelivery({store,send,recipient,clock=Date.now,revalidate,prepare=null,claim_ms=30000}){
  if(!store?.atomic||!send||!recipient||!revalidate)throw Error('DELIVERY_CONTEXT_REQUIRED');
  const terminal=card=>['SENT','UNKNOWN','ERROR','STALE','SUPPRESSED'].includes(card?.state);
  // Tokens are issued only after the actual private preparation callback. They
  // cannot be supplied through JSON, reused, or transferred to another analysis.
  const preparations=new WeakMap();
  async function preparePublication({analysis,input}){
    if(!prepare)return null;
    const wave=await store.get('pump:delivery-wave:'+analysis.instrument.instrument_id+':'+analysis.wave_id);
    const prior=wave?.primary_card_id?await store.get('pump:card:'+wave.primary_card_id):null;
    const update=prior?.state==='SENT'&&['PLAN_INVALIDATED','ENTRY_ZONE_REPLACED','EXIT_ZONE_REPLACED'].includes(analysis.update_kind);
    if(prior&&!['STALE','ERROR'].includes(prior.state)&&!update)return {skipped:true};
    const result=await prepare({analysis,input});
    if(!result||result.skipped)return result;
    if(!result.input||!result.analysis)throw new BudgetRefusal('PUBLICATION_PREPARATION_REQUIRED');
    const snapshot=structuredClone({input:result.input,analysis:result.analysis}),token=result.accepted?Object.freeze({}):null;
    if(token)preparations.set(token,snapshot);
    return {...result,input:structuredClone(snapshot.input),analysis:structuredClone(snapshot.analysis),preparation_token:token};
  }
  const work=createWorkIndex({store,kind:'delivery',targetKey:id=>'pump:card:'+id,completed:card=>terminal(card)&&(card.analysis?.kind==='DELIVERY_DIAGNOSTIC'||card.publication_registered===true)&&(card.state!=='SENT'||positiveMessageId(card.message_id)&&card.receipt?.text_hash===card.text_hash&&card.receipt?.recipient===card.recipient)});
  async function enqueue(analysis,{mode,expires_ts,update_kind=null}={}){
    const refusal=ownerPublicationRefusal(analysis);if(refusal&&analysis?.kind!=='DELIVERY_DIAGNOSTIC')throw new BudgetRefusal(refusal);
    if(!analysis?.ready||!analysis.card_text||!analysis.wave_id||analysis.card_text.length>4096)throw new BudgetRefusal('READY_ANALYSIS_REQUIRED');
    if(mode==='AUTO'&&!analysis.automatic_eligible)throw new BudgetRefusal('AUTOMATIC_GROWTH_NOT_QUALIFIED');
    if(!['AUTO','MANUAL'].includes(mode)||!Number.isSafeInteger(expires_ts)||expires_ts<=clock())throw new BudgetRefusal('CARD_VALIDITY_REQUIRED');
    await work.ensureReady();
    const hash=await textHash(analysis.card_text),identity=analysis.instrument.instrument_id+'|'+analysis.wave_id+'|'+hash;
    const waveKey='pump:delivery-wave:'+analysis.instrument.instrument_id+':'+analysis.wave_id;
    const previousWave=await store.get(waveKey);
    const previousCard=previousWave?.primary_card_id?await store.get('pump:card:'+previousWave.primary_card_id):null;
    const validOriginal=key=>typeof key==='string'&&/^pump:analysis:[a-f0-9]{64}$/.test(key);
    const freshOriginal=validOriginal(analysis.source_input_key)&&validOriginal(previousCard?.analysis?.source_input_key)&&analysis.source_input_key!==previousCard.analysis.source_input_key&&Number.isSafeInteger(analysis.analysis_ts)&&Number.isSafeInteger(previousCard.analysis.analysis_ts)&&analysis.analysis_ts>previousCard.analysis.analysis_ts&&analysis.analysis_ts<=clock();
    const knownHashId=previousWave?.card_by_hash?.[hash];
    if(knownHashId!==undefined&&!(typeof knownHashId==='string'&&/^PUMP:[a-f0-9]{64}$/.test(knownHashId)))throw new BudgetRefusal('INVALID_DELIVERY_HASH_POINTER');
    // A fresh immutable original can replace a confirmed unsent same-text
    // primary. Known hash targets otherwise keep their existing identity.
    const recovery=knownHashId!==undefined&&knownHashId===previousCard?.card_id&&previousCard?.card_id===previousWave?.primary_card_id&&['STALE','ERROR'].includes(previousCard.state)&&freshOriginal;
    const id=recovery?'PUMP:'+await textHash(identity+'|'+analysis.source_input_key):knownHashId??'PUMP:'+await textHash(identity);
    const card={delivery_schema:'PUMP_DELIVERY_V2',card_id:id,text:analysis.card_text,text_hash:hash,recipient:String(recipient),mode,analysis,created_ts:clock(),expires_ts,state:'READY',message_id:null,owner:null,claim_until:null,send_started_ts:null,attempts:0};
    // Save immutable content before the wave pointer. A lost queue ACK is
    // repaired by the next enqueue, while a sent card remains immutable.
    await store.atomic('pump:card:'+id,current=>{
      if(current&&(current.text!==card.text||current.text_hash!==hash||current.recipient!==card.recipient))throw new BudgetRefusal('IMMUTABLE_CARD_CONFLICT');
      return {state:current??card,result:true};
    });
    const saved=await store.get('pump:card:'+id);if(saved?.text!==card.text||saved.text_hash!==hash)throw new BudgetRefusal('SAVED_CARD_READBACK_FAILED');
    const decision=await store.atomic(waveKey,current=>{
      current??={primary_card_id:null,updates:[],card_by_hash:{}};
      const knownPrevious=previousCard?.card_id===current.primary_card_id;
      const replaceUnsent=knownPrevious&&['STALE','ERROR'].includes(previousCard.state);
      const recoverSameHash=replaceUnsent&&freshOriginal&&current.card_by_hash[hash]===previousCard.card_id&&id!==current.card_by_hash[hash];
      if(current.card_by_hash[hash]&&!recoverSameHash)return {state:current,result:{duplicate:true,card_id:current.card_by_hash[hash]}};
      const substantialUpdate=knownPrevious&&previousCard.state==='SENT'&&['PLAN_INVALIDATED','ENTRY_ZONE_REPLACED','EXIT_ZONE_REPLACED'].includes(update_kind);
      if(current.primary_card_id&&!replaceUnsent&&!substantialUpdate)return {state:current,result:{duplicate:true,card_id:current.primary_card_id,reason:'NO_CONFIRMED_REPLACEMENT_OR_UPDATE'}};
      const claim={card_id:id,hash,update_kind,ts:clock()};if(!current.primary_card_id||replaceUnsent)current.primary_card_id=id;else current.updates.push(claim);current.card_by_hash[hash]=id;
      return {state:current,result:{duplicate:false,card_id:id}};
    });
    if(decision.card_id!==id)await store.atomic('pump:card:'+id,current=>({state:current?.state==='READY'&&current.attempts===0?{...current,state:'SUPPRESSED',reason:'NO_SUBSTANTIAL_PLAN_CHANGE'}:current,result:true}));
    await work.add(decision.card_id);
    return {...decision,text_hash:hash};
  }
  async function dispatch(card_id,{preparation_token=null,native_stage=null}={}){
    const db=native_stage?store.withStage(native_stage):store;
    const finishRequired=(card,changes)=>finish(card,changes,native_stage);
    const prepared=preparation_token&&preparations.get(preparation_token);
    if(preparation_token){preparations.delete(preparation_token);if(!prepared)throw new BudgetRefusal('PUBLICATION_PREPARATION_TOKEN_NOT_OWNED');}
    const owner=crypto.randomUUID(),now=clock();
    const card=await db.atomic('pump:card:'+card_id,current=>{
      if(!current)return {state:current,result:{skip:'CARD_NOT_FOUND'}};
      if(current.state==='SENDING'&&current.claim_until<=now){const possible=current.delivery_schema!=='PUMP_DELIVERY_V2'||Number.isSafeInteger(current.send_started_ts);current.state=possible?'UNKNOWN':'ERROR';current.updated_ts=now;current.reason=possible?'SENDER_INTERRUPTED_AFTER_POSSIBLE_SEND':'SENDER_INTERRUPTED_BEFORE_SEND';return {state:current,result:{skip:current.state}};}
      if(!['READY','RETRYABLE'].includes(current.state))return {state:current,result:{skip:current.state}};
      const refusal=ownerPublicationRefusal(current.analysis);
      if(refusal&&current.analysis?.kind!=='DELIVERY_DIAGNOSTIC'){current.state='SUPPRESSED';current.reason=refusal;current.updated_ts=now;return {state:current,result:{skip:'SUPPRESSED',reason:refusal}};}
      if(current.expires_ts<=now||current.mode==='AUTO'&&!automaticWindowOpen(now)){current.state='STALE';current.updated_ts=now;return {state:current,result:{skip:'STALE'}};}
      if((current.retry_after_ts??0)>now)return {state:current,result:{skip:'BACKOFF'}};
      current.state='SENDING';current.owner=owner;current.claim_until=now+claim_ms;current.send_started_ts=null;current.attempts++;
      return {state:current,result:structuredClone(current)};
    });
    if(card.skip)return {state:card.skip,card_id,...(card.reason?{reason:card.reason}:{})};
    let fresh;try{
      if(prepared){const {source_input_key,...a}=card.analysis;
        if(!same(a,prepared.analysis)||source_input_key!=='pump:analysis:'+await textHash(JSON.stringify(prepared.analysis)))throw new BudgetRefusal('PUBLICATION_PREPARATION_ORIGINAL_CONFLICT');}
      fresh=await revalidate(card,{...(prepared?{prepared_input:prepared.input}:{}),native_stage});
    }catch{await finishRequired(card,{state:'ERROR',reason:'RECHECK_FAILED_BEFORE_SEND'});return {state:'ERROR',card_id};}
    if(!fresh?.valid){await finishRequired(card,{state:'STALE',reason:fresh?.reason??'SCENARIO_RECHECK_FAILED'});return {state:'STALE',card_id};}
    if(await textHash(card.text)!==card.text_hash){await finishRequired(card,{state:'ERROR',reason:'SAVED_TEXT_HASH_MISMATCH'});throw new BudgetRefusal('SAVED_TEXT_HASH_MISMATCH');}
    if(card.expires_ts<=clock()||card.mode==='AUTO'&&!automaticWindowOpen(clock())){await finishRequired(card,{state:'STALE',reason:'PUBLICATION_WINDOW_CLOSED'});return {state:'STALE',card_id};}
    let reply;
    await db.atomic('pump:card:'+card.card_id,current=>{if(current?.state!=='SENDING'||current.owner!==card.owner)throw new BudgetRefusal('DELIVERY_CLAIM_NOT_OWNED');return {state:{...current,send_started_ts:clock()},result:true};});
    try{reply=await send({text:card.text,recipient:card.recipient,card_id:card.card_id,text_hash:card.text_hash,native_stage});}
    catch(error){const before=error?.send_attempted===false;await finishRequired(card,{state:before?'ERROR':'UNKNOWN',reason:before?'SEND_REFUSED_BEFORE_HTTP':'TELEGRAM_ACK_UNKNOWN'});return {state:before?'ERROR':'UNKNOWN',card_id};}
    const message=reply?.body?.result,id=message?.message_id;
    if(reply?.ok===true&&reply.body?.ok===true&&positiveMessageId(id)&&String(message.chat?.id)===card.recipient&&(!Object.hasOwn(message,'text')||message.text===card.text)){
      const receipt={message_id:String(id),recipient:card.recipient,card_id,text_hash:card.text_hash,confirmed_ts:clock(),telegram_date:message.date??null};
      if(Number.isSafeInteger(reply.http_started_ts)&&Number.isSafeInteger(reply.http_ack_received_ts))Object.assign(receipt,{http_started_ts:reply.http_started_ts,http_ack_received_ts:reply.http_ack_received_ts,http_clock_basis:reply.http_clock_basis??null});
      if(reply.liquidation_freshness)receipt.liquidation_freshness=reply.liquidation_freshness;
      await finishRequired(card,{state:'SENT',message_id:String(id),receipt});
      const saved=await db.get('pump:card:'+card_id);
      if(saved?.state!=='SENT'||!same(saved.receipt,receipt)||saved.text!==card.text||saved.text_hash!==card.text_hash)throw new BudgetRefusal('TELEGRAM_RECEIPT_READBACK_FAILED');
      return {state:'SENT',card_id,message_id:String(id),receipt_readback:true};
    }
    const retryable=reply?.body?.ok===false&&reply?.status===429;
    const knownRejected=reply?.body?.ok===false&&Number.isInteger(reply?.status)&&reply.status>=400&&reply.status<500;
    await finishRequired(card,{state:retryable?'RETRYABLE':knownRejected?'ERROR':'UNKNOWN',reason:retryable?'TELEGRAM_RATE_LIMIT':knownRejected?'TELEGRAM_REJECTED':'TELEGRAM_ACK_UNKNOWN',retry_after_ts:retryable?clock()+Math.max(1000,Number(reply.body.parameters?.retry_after??60)*1000):null});
    return {state:retryable?'RETRYABLE':knownRejected?'ERROR':'UNKNOWN',card_id};
  }
  async function finish(card,changes,native_stage=null){return (native_stage?store.withStage(native_stage):store).atomic('pump:card:'+card.card_id,current=>{if(current?.state!=='SENDING'||current.owner!==card.owner)throw new BudgetRefusal('DELIVERY_CLAIM_NOT_OWNED');return {state:{...current,...changes,owner:null,claim_until:null,updated_ts:clock()},result:true};});}
  async function pending({limit=20}={}){const page=await work.page({limit});if(!page.ready)throw new BudgetRefusal('WORK_INDEX_MIGRATING');return page.items.map(row=>row.id);}
  async function acknowledge(card_id,{native_stage=null}={}){
    const db=native_stage?store.withStage(native_stage):store;
    const requiredWork=native_stage?createWorkIndex({store:db,kind:'delivery',targetKey:id=>'pump:card:'+id,completed:card=>terminal(card)&&card.publication_registered===true&&(card.state!=='SENT'||positiveMessageId(card.message_id)&&card.receipt?.text_hash===card.text_hash&&card.receipt?.recipient===card.recipient)}):work;
    await db.atomic('pump:card:'+card_id,card=>{if(!terminal(card))throw new BudgetRefusal('TERMINAL_DELIVERY_REQUIRED');return {state:{...card,publication_registered:true},result:true};});
    return requiredWork.complete(card_id,{evidence_key:'pump:card:'+card_id});
  }
  async function drain({limit=20}={}){
    const ids=await pending({limit}),results=[];
    for(const id of ids){try{results.push(await dispatch(id));}catch(error){if(/NATIVE_SQL|STATE_CAS|STATE_PAIR/.test(error.code??error.message??'')||store.usage?.().unknown_ops>0)throw error;results.push({card_id:id,state:'ERROR',reason:error.code??'DELIVERY_ERROR'});}}
    return results;
  }
  return {preparePublication,enqueue,dispatch,drain,pending,acknowledge};
}
