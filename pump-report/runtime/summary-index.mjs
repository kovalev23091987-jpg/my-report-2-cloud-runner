import {textHash} from './text-hash.mjs';
const HEAD='pump:summary-ordered-head:v1',PREFIX='pump:summary-ordered:v1:',MEMBER='pump:summary-member:v1:',LEGACY='pump:summary-record-index';
const validId=id=>typeof id==='string'&&/^pump:summary-record:[a-f0-9]{64}$/.test(id);
const pointerKey=seq=>PREFIX+String(seq).padStart(16,'0');
const empty=()=>({version:1,count:0,pending:null,legacy_imported:false,legacy_hash:null,legacy_count:null});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createSummaryRecordIndex({store}){
  if(!store.atomicPair||!store.boundedArray||!store.scanPrefix)throw Error('BOUNDED_SUMMARY_INDEX_STORE_REQUIRED');
  async function recover(){
    const head=await store.get(HEAD)??empty(),pending=head.pending;if(!pending)return head;
    if(!validId(pending.id)||pending.seq!==head.count+1)throw Error('SUMMARY_INDEX_PENDING_CONFLICT');
    const row=await store.get(pending.id);if(row?.record_id!==pending.id)throw Error('SUMMARY_INDEX_PENDING_RECORD_MISSING');
    const expected={seq:pending.seq,id:pending.id};
    await store.atomicPair([HEAD,pointerKey(pending.seq)],([current,pointer])=>{
      if(pointer&&!same(pointer,expected))throw Error('SUMMARY_INDEX_POINTER_CONFLICT');
      if(current?.count>=pending.seq&&same(pointer,expected))return {states:[current,pointer],result:true};
      if(!same(current?.pending,pending))throw Error('SUMMARY_INDEX_PENDING_CONFLICT');
      return {states:[{...current,count:pending.seq,pending:null},expected],result:true};
    });
    return store.get(HEAD);
  }
  async function appendRaw(id,{migrating=false}={}){
    if(!validId(id))throw Error('SUMMARY_RECORD_ID_REQUIRED');
    if((await store.get(id))?.record_id!==id)throw Error('SAVED_SUMMARY_RECORD_REQUIRED');
    for(let attempt=0;attempt<8;attempt++){
      await recover();let seq;
      try{seq=await store.atomicPair([HEAD,MEMBER+id.slice(-64)],([head,member])=>{
        head??=empty();if(!migrating&&!head.legacy_imported)throw Error('SUMMARY_INDEX_MIGRATING');
        if(member){if(member.id!==id||!Number.isSafeInteger(member.seq)||member.seq<1)throw Error('SUMMARY_INDEX_MEMBER_CONFLICT');return {states:[head,member],result:member.seq};}
        if(head.pending)throw Error('SUMMARY_INDEX_BUSY');
        if(!Number.isSafeInteger(head.count)||head.count<0||!Number.isSafeInteger(head.count+1))throw Error('SUMMARY_INDEX_SEQUENCE_INVALID');
        const pending={id,seq:head.count+1};return {states:[{...head,pending},pending],result:pending.seq};
      });}catch(e){if(e.message==='SUMMARY_INDEX_BUSY')continue;throw e;}
      await recover();return seq;
    }
    throw Error('SUMMARY_INDEX_CONTENTION');
  }
  async function initialize({max_imports=4}={}){
    if(!Number.isSafeInteger(max_imports)||max_imports<1||max_imports>4)throw Error('SUMMARY_MIGRATION_PAGE_BOUND_REQUIRED');
    let head=await recover();if(head.legacy_imported)return {ready:true,head};
    const ids=await store.boundedArray(LEGACY,{max_items:40,max_bytes:10000});
    if(new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))throw Error('LEGACY_SUMMARY_INDEX_IDENTITY_CONFLICT');
    const hash=await textHash(JSON.stringify(ids));
    await store.atomic(HEAD,current=>{current??=empty();if(current.legacy_hash&&current.legacy_hash!==hash)throw Error('LEGACY_SUMMARY_INDEX_CHANGED');return {state:{...current,legacy_hash:hash,legacy_count:ids.length},result:true};});
    head=await recover();
    for(const id of ids.slice(head.count,head.count+max_imports))await appendRaw(id,{migrating:true});
    head=await recover();
    if(head.count<ids.length)return {ready:false,head};
    await store.atomic(HEAD,current=>{if(current.legacy_imported)return {state:current,result:true};if(current.count!==ids.length||current.pending)throw Error('LEGACY_SUMMARY_INDEX_ORDER_CONFLICT');return {state:{...current,legacy_imported:true,legacy_source_retained:true},result:true};});
    return {ready:true,head:await store.get(HEAD)};
  }
  async function append(id){const migration=await initialize();if(!migration.ready)throw Error('SUMMARY_INDEX_MIGRATING');return appendRaw(id);}
  async function page({after=0,limit=40}={}){
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>40)throw Error('SUMMARY_INDEX_PAGE_BOUND_REQUIRED');
    const migration=await initialize();if(!migration.ready)return {migration_ready:false,total:migration.head.count,items:[]};
    const head=await recover();if(after>head.count)throw Error('SUMMARY_APPEND_ONLY_INDEX_RECONCILIATION_REQUIRED');
    const rows=await store.scanPrefix(PREFIX,{after_key:after?pointerKey(after):PREFIX,limit});
    const items=rows.map(r=>r.value);for(let i=0;i<items.length;i++)if(items[i].seq!==after+i+1||!validId(items[i].id))throw Error('SUMMARY_INDEX_SEQUENCE_GAP');
    if(after<head.count&&!items.length)throw Error('SUMMARY_INDEX_SEQUENCE_GAP');
    return {migration_ready:true,total:head.count,items:items.filter(r=>r.seq<=head.count)};
  }
  // Audit readers do not initialize, migrate or recover the writer's index.
  // The captured head bounds this page even when new records are appended.
  async function readPage({after=0,limit=10}={}){
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error('SUMMARY_AUDIT_PAGE_BOUND_REQUIRED');
    const head=await store.get(HEAD)??empty();
    if(!Number.isSafeInteger(head.count)||head.count<0)throw Error('SUMMARY_INDEX_SEQUENCE_INVALID');
    if(!head.legacy_imported||head.pending)return {migration_ready:false,total:head.count,items:[],pending:Boolean(head.pending)};
    if(after>head.count)throw Error('SUMMARY_APPEND_ONLY_INDEX_RECONCILIATION_REQUIRED');
    const rows=await store.scanPrefix(PREFIX,{after_key:after?pointerKey(after):PREFIX,limit});
    const items=rows.map(r=>r.value).filter(r=>r.seq<=head.count);
    for(let i=0;i<items.length;i++)if(items[i].seq!==after+i+1||!validId(items[i].id))throw Error('SUMMARY_INDEX_SEQUENCE_GAP');
    if(items.length!==Math.min(limit,head.count-after))throw Error('SUMMARY_INDEX_SEQUENCE_GAP');
    return {migration_ready:true,total:head.count,items,pending:false};
  }
  async function boundary(){const head=await store.get(HEAD)??empty();return {count:head.count,ready:head.legacy_imported,pending:Boolean(head.pending)};}
  return {initialize,append,page,readPage,boundary};
}
