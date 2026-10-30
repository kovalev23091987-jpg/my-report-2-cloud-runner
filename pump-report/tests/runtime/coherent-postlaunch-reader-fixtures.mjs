// New reader fixtures reuse the accepted BZ65 data factory, not its cases.
// Every journal/card/label below is created by the actual frozen modules.
export async function buildCompatibilityFixtures({modulesRoot,feature:F,legacy:L,version:V,fixture_factory:fixture}){
 const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
 const root=modulesRoot instanceof URL?modulesRoot:pathToFileURL(resolve(modulesRoot)+'/');
 const [{MemoryStore},{createOutcomeJournal},{createDelivery},{evaluateOutcome},{START_PROFILE}]=await Promise.all([
 import(new URL('runtime/store.mjs',root)),import(new URL('runtime/outcome-journal.mjs',root)),
 import(new URL('runtime/delivery.mjs',root)),import(new URL('analytics/index.mjs',root)),
 import(new URL('profile/start-v1.mjs',root))]);
 const combined=new Map(),entries=[];
 for(const [i,label]of ['HIT','MISS','UNKNOWN','HIT'].entries()){
   let sample=fixture('base');
   if(i===3){const shift=v=>Array.isArray(v)?v.map(shift):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shift(x)])):typeof v==='number'&&v>=Date.UTC(2026,0,1)?v+7*3600000:v;sample=shift(sample);}
   const {analysis,input}=sample,t0=Math.ceil(analysis.analysis_ts/60000)*60000;
   input.run_id='CONTROLLED_BZ67_'+label;input.run_purpose='PRODUCTION';input.analysis_ts=t0;
   input.instrument.instrument_id='BINGX:PERPETUAL:CONTROLLED-BZ67-'+i+'-USDT';
   input.instrument.asset_id='CONTROLLED:BZ67:'+i;
   for(const f of Object.values(input.facts))f.instrument_id=input.instrument.instrument_id;
   analysis.instrument=structuredClone(input.instrument);analysis.run_id=input.run_id;analysis.run_purpose='PRODUCTION';
   analysis.analysis_ts=t0;analysis.wave_id='CONTROLLED:BZ67:W'+i;analysis.card_text='CONTROLLED_READER_CARD_'+i;
   const store=new MemoryStore(),analysis_key='pump:analysis:'+await F.capsuleDigest(analysis),producer='a'.repeat(64);
   const saved_analysis={analysis,input,saved_ts:t0,implementation_sha256:producer,evidence_class:'OBSERVED'};
   await store.set(analysis_key,saved_analysis);
   let now=t0;
   const journal=createOutcomeJournal({store,profile:START_PROFILE,clock:()=>now,evidence_class:'OBSERVED'});
   await journal.remember(analysis,input,analysis_key);
   const delivery=createDelivery({store,clock:()=>now,recipient:'CONTROLLED_READER_RECIPIENT',revalidate:async()=>({valid:true}),
    send:async()=>({ok:true,status:200,body:{ok:true,result:{message_id:9100+i,chat:{id:'CONTROLLED_READER_RECIPIENT'},date:Math.floor(now/1000)}}})});
   const card=await delivery.enqueue({...analysis,source_input_key:analysis_key},{mode:analysis.mode,expires_ts:t0+60000});
   const sent=await delivery.dispatch(card.card_id);
   if(sent.state!=='SENT')throw Error('CONTROLLED_READER_DELIVERY_NOT_SENT');
   const selected=await journal.publication(card.card_id),signal=await store.get(selected.summary_origin.signal_id);
   now=t0+14400000+1000+i;
   const candles=label==='UNKNOWN'?[]:Array.from({length:240},(_,n)=>({open_ts:t0+n*60000,close_ts:t0+(n+1)*60000,closed:true,open:100,high:label==='HIT'&&n===10?112:105,low:99,close:100}));
   const outcomeValue=evaluateOutcome({signal,candles,price_points:[],as_of_ts:now});
   if(outcomeValue.status!==label)throw Error('CONTROLLED_READER_LABEL_MISMATCH_'+label);
   await store.set('pump:outcome:'+signal.signal_id,outcomeValue);
   const recordKey=await journal.record(signal,outcomeValue),record=await store.get(recordKey);
   const codec=i===0?L:F;
   const feature=await codec.prepareFeatureCapsule({analysis,input,analysis_key,implementation_sha256:producer,
    ...(i===0?{}:{projection_writer_implementation_sha256:'b'.repeat(64)}),recorded_ts:t0,evidence_class:'OBSERVED'});
   const outcome=await codec.prepareOutcomeCapsule({feature_capsule:feature.capsule,feature_sha256:feature.sha256,
    outcome:record.outcome,publication:record.publication,recorded_ts:record.recorded_ts,summary_record_id:record.record_id});
   const savedCard=await store.get('pump:card:'+card.card_id);
   const projection=await F.projectProtectedReferences({analysis_key,analysis,input,signal,card:savedCard,summary_records:[record]});
   const refsSha=await F.capsuleDigest(projection),refs={key:'pump:protected-refs:v2:'+refsSha,sha256:refsSha};
   const link=V.versionedSummaryLink(feature,outcome,record,refs);
   await store.set(feature.key,feature);await store.set(outcome.key,outcome);
   await store.set(refs.key,{...refs,projection});
   await store.set(i===0?V.v2SummaryLinkKey(record.record_id):V.v3SummaryLinkKey(record.record_id),link);
   let projection_pointer=null;
   if(i!==0){
    const key=V.projectionPointerKey(feature.capsule),pointer={schema:'pump-feature-pointer-v3-seed-window-20261030',projection_revision:F.FEATURE_PROJECTION_REVISION,
     analysis_key,feature_key:feature.key,feature_sha256:feature.sha256};
    projection_pointer={key,pointer};await store.set(key,pointer);
   }
   const storedJournal=await store.get('pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id);
   entries.push({record,evidence:{link,feature,outcome,saved_analysis,projection_pointer,anchor_meta:{origin_anchor:storedJournal.frozen_anchor}}});
   for(const k of [analysis_key,feature.key,outcome.key,refs.key,i===0?V.v2SummaryLinkKey(record.record_id):V.v3SummaryLinkKey(record.record_id),projection_pointer?.key,'pump:journal:'+analysis.instrument.instrument_id+':'+analysis.wave_id,signal.signal_id,'pump:card:'+card.card_id,record.record_id,'pump:outcome:'+signal.signal_id].filter(Boolean)){const v=await store.get(k);if(v===null)throw Error('CONTROLLED_REQUIRED_FIXTURE_ROW_MISSING');if(combined.has(k)&&JSON.stringify(combined.get(k))!==JSON.stringify(v))throw Error('CONTROLLED_READER_STATE_COLLISION');combined.set(k,v);}
 }
 const t0=entries[0].record.origin.t0;
 const old=entries[0],saved=old.evidence.saved_analysis;
 const newFeature=await F.prepareFeatureCapsule({analysis:saved.analysis,input:saved.input,analysis_key:old.evidence.feature.capsule.analysis_key,
  implementation_sha256:saved.implementation_sha256,projection_writer_implementation_sha256:'b'.repeat(64),recorded_ts:saved.saved_ts,evidence_class:saved.evidence_class});
 const later=structuredClone(old.record);later.outcome.reasons=[...(later.outcome.reasons??[]),'CONTROLLED_LATER_COVERAGE_REVIEW'];later.recorded_ts=t0+6*3600000+1000;
 later.record_id='pump:summary-record:'+await F.capsuleDigest({origin:later.origin,publication:later.publication,outcome:later.outcome});
 const laterOutcome=await F.prepareOutcomeCapsule({feature_capsule:newFeature.capsule,feature_sha256:newFeature.sha256,outcome:later.outcome,publication:later.publication,recorded_ts:later.recorded_ts,summary_record_id:later.record_id});
 const card=combined.get(later.publication.receipt_ref.slice(0,-8)),signal=combined.get(later.origin.signal_id);
 const projection=await F.projectProtectedReferences({analysis_key:newFeature.capsule.analysis_key,analysis:saved.analysis,input:saved.input,signal,card,summary_records:[later]});
 const h=await F.capsuleDigest(projection),refs={key:'pump:protected-refs:v2:'+h,sha256:h},link=V.versionedSummaryLink(newFeature,laterOutcome,later,refs);
 const pointerKey=V.projectionPointerKey(newFeature.capsule),pointer={schema:'pump-feature-pointer-v3-seed-window-20261030',projection_revision:F.FEATURE_PROJECTION_REVISION,analysis_key:newFeature.capsule.analysis_key,feature_key:newFeature.key,feature_sha256:newFeature.sha256};
 for(const [k,v]of [[newFeature.key,newFeature],[laterOutcome.key,laterOutcome],[refs.key,{...refs,projection}],[V.v3SummaryLinkKey(later.record_id),link],[pointerKey,pointer],[later.record_id,later]])combined.set(k,v);
 entries.push({record:later,evidence:{link,feature:newFeature,outcome:laterOutcome,saved_analysis:saved,projection_pointer:{key:pointerKey,pointer},anchor_meta:old.evidence.anchor_meta}});
 // A direct evidence resolver can present two same-revision projections of one
 // original; the cohort must reject their conflicting immutable digests.
 const modern=entries[1],badFeature=structuredClone(modern.evidence.feature);
 badFeature.capsule.projection_writer_implementation_sha256='c'.repeat(64);badFeature.sha256=await F.capsuleDigest(badFeature.capsule);
 const conflictRow=structuredClone(modern.record);conflictRow.outcome.reasons=[...(conflictRow.outcome.reasons??[]),'CONTROLLED_SAME_REVISION_CONFLICT'];conflictRow.recorded_ts+=2000;
 conflictRow.record_id='pump:summary-record:'+await F.capsuleDigest({origin:conflictRow.origin,publication:conflictRow.publication,outcome:conflictRow.outcome});
 const conflictOutcome=await F.prepareOutcomeCapsule({feature_capsule:badFeature.capsule,feature_sha256:badFeature.sha256,outcome:conflictRow.outcome,publication:conflictRow.publication,recorded_ts:conflictRow.recorded_ts,summary_record_id:conflictRow.record_id});
 const conflictPointer=structuredClone(modern.evidence.projection_pointer);conflictPointer.pointer.feature_sha256=badFeature.sha256;
 const conflictLink=V.versionedSummaryLink(badFeature,conflictOutcome,conflictRow,modern.evidence.link.protected_refs);
 const conflict={record:conflictRow,evidence:{...modern.evidence,feature:badFeature,outcome:conflictOutcome,link:conflictLink,projection_pointer:conflictPointer}};
 return {entries,state_entries:[...combined],same_original_first_record_id:old.record.record_id,same_generation_conflict:[modern,conflict],as_of_ts:t0+12*3600000,split_plan:{split_ts:t0+6*3600000,declared_ts:t0-3600000,plan_ref:'CONTROLLED_BZ67_PREDECLARED_SPLIT'}};
}
