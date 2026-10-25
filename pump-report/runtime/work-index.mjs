import {textHash} from './text-hash.mjs';
const legacyKeys={manual:'pump:manual-queue',delivery:'pump:delivery-queue',journal:'pump:journal-index',outcomes:'pump:outcomes-pending'};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=512&&!/[\u0000-\u001f]/.test(id);
const initial=()=>({version:1,count:0,pending:null,cursor:0,legacy_imported:false,legacy_hash:null,legacy_count:null,legacy_cursor:0});

// Only derived ready references are removed. Targets, completed membership,
// evidence and the original bounded migration source remain durable.
export function createWorkIndex({store,kind,targetKey,completed}){
  if(!legacyKeys[kind]||!store.atomicPair||!store.scanPrefix||!store.boundedArray||!store.removeWorkPointer||typeof targetKey!=='function'||typeof completed!=='function')throw Error('BOUNDED_WORK_INDEX_CONTEXT_REQUIRED');
  const base='pump:work-index:v1:'+kind+':',headKey=base+'head',prefix=base+'ready:',memberPrefix=base+'member:';
  const pointerKey=seq=>prefix+String(seq).padStart(16,'0');
  const memberKey=async id=>memberPrefix+await textHash(id);
  async function recover(){
    const head=await store.get(headKey)??initial(),p=head.pending;if(!p)return head;
    if(!validId(p.id)||!Number.isSafeInteger(p.seq)||p.seq!==head.count+1)throw Error('WORK_INDEX_PENDING_CONFLICT');
    if(!await store.get(targetKey(p.id)))throw Error('WORK_INDEX_PENDING_TARGET_MISSING');
    const member=await store.get(await memberKey(p.id));
    if(member?.id===p.id&&member.seq===p.seq&&member.status==='DONE'){
      const current=await store.get(headKey);if(current?.count>=p.seq&&!same(current.pending,p))return current;
    }
    if(member?.id!==p.id||member.seq!==p.seq||member.status!=='ACTIVE')throw Error('WORK_INDEX_PENDING_MEMBER_CONFLICT');
    const expected={id:p.id,seq:p.seq};
    try{await store.atomicPair([headKey,pointerKey(p.seq)],([current,pointer])=>{
      if(pointer&&!same(pointer,expected))throw Error('WORK_INDEX_POINTER_CONFLICT');
      if(current?.count>=p.seq&&same(pointer,expected))return {states:[current,pointer],result:true};
      if(current?.count>=p.seq&&!pointer)throw Error('WORK_INDEX_COMMITTED_POINTER_REMOVED');
      if(!same(current?.pending,p))throw Error('WORK_INDEX_PENDING_CONFLICT');
      return {states:[{...current,count:p.seq,pending:null},expected],result:true};
    });}catch(error){
      if(error.message!=='WORK_INDEX_COMMITTED_POINTER_REMOVED')throw error;
      const done=await store.get(await memberKey(p.id));if(done?.id!==p.id||done.seq!==p.seq||done.status!=='DONE')throw error;
    }return store.get(headKey);
  }
  async function addRaw(id,{migrating=false}={}){
    if(!validId(id)||!await store.get(targetKey(id)))throw Error('SAVED_WORK_TARGET_REQUIRED');
    const key=await memberKey(id);
    for(let attempt=0;attempt<8;attempt++){
      await recover();let result;
      try{result=await store.atomicPair([headKey,key],([head,member])=>{
        head??=initial();if(!migrating&&!head.legacy_imported)throw Error('WORK_INDEX_MIGRATING');
        if(member){if(member.id!==id||!Number.isSafeInteger(member.seq)||member.seq<1||!['ACTIVE','DONE'].includes(member.status))throw Error('WORK_INDEX_MEMBER_CONFLICT');return {states:[head,member],result:member};}
        if(head.pending)throw Error('WORK_INDEX_BUSY');
        if(!Number.isSafeInteger(head.count)||head.count<0||!Number.isSafeInteger(head.count+1)||head.count+1>9999999999999999)throw Error('WORK_INDEX_SEQUENCE_INVALID');
        const pending={id,seq:head.count+1},next={...pending,status:'ACTIVE'};
        return {states:[{...head,pending},next],result:next};
      });}catch(e){if(e.message==='WORK_INDEX_BUSY')continue;throw e;}
      await recover();return result;
    }throw Error('WORK_INDEX_CONTENTION');
  }
  async function initialize({max_imports=4}={}){
    if(!Number.isSafeInteger(max_imports)||max_imports<1||max_imports>4)throw Error('WORK_MIGRATION_BOUND_REQUIRED');
    let head=await recover();if(head.legacy_imported)return {ready:true,head};
    const ids=await store.boundedArray(legacyKeys[kind],{max_items:40,max_bytes:10000});
    if(new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))throw Error('LEGACY_WORK_INDEX_IDENTITY_CONFLICT');
    const hash=await textHash(JSON.stringify(ids));
    await store.atomic(headKey,current=>{current??=initial();if(current.legacy_hash&&current.legacy_hash!==hash)throw Error('LEGACY_WORK_INDEX_CHANGED');return {state:{...current,legacy_hash:hash,legacy_count:ids.length},result:true};});
    head=await recover();
    const start=head.legacy_cursor;
    for(const [offset,id] of ids.slice(start,start+max_imports).entries()){
      await addRaw(id,{migrating:true});
      await store.atomic(headKey,current=>{const at=start+offset;if(current.legacy_cursor>at)return {state:current,result:true};if(current.legacy_cursor!==at||ids[at]!==id)throw Error('LEGACY_WORK_CURSOR_CONFLICT');return {state:{...current,legacy_cursor:at+1},result:true};});
    }
    head=await recover();if(head.legacy_cursor<ids.length)return {ready:false,head};
    await store.atomic(headKey,current=>{if(current.pending||current.legacy_cursor!==ids.length)throw Error('LEGACY_WORK_MIGRATION_CONFLICT');return {state:{...current,legacy_imported:true,legacy_source_retained:true},result:true};});
    return {ready:true,head:await store.get(headKey)};
  }
  async function ensureReady(){if(!(await initialize()).ready)throw Error('WORK_INDEX_MIGRATING');}
  async function add(id){await ensureReady();return addRaw(id);}
  async function complete(id,{evidence_key=null}={}){
    if(!validId(id))throw Error('WORK_TARGET_ID_REQUIRED');
    await ensureReady();const key=await memberKey(id),member=await store.get(key);
    if(!member)return false;if(member.id!==id)throw Error('WORK_INDEX_MEMBER_CONFLICT');
    if(member.status!=='DONE'){
      const target=await store.get(targetKey(id)),evidence=evidence_key?await store.get(evidence_key):null;
      if(!target||!await completed(target,{id,evidence,evidence_key}))throw Error('DURABLE_WORK_COMPLETION_EVIDENCE_REQUIRED');
      await store.atomic(key,current=>{if(current?.id!==id||current.seq!==member.seq)throw Error('WORK_INDEX_MEMBER_CONFLICT');return {state:current.status==='DONE'?current:{...current,status:'DONE',evidence_key},result:true};});
    }
    await store.removeWorkPointer(pointerKey(member.seq));return true;
  }
  async function page({limit=40,advance=true}={}){
    if(!Number.isSafeInteger(limit)||limit<1||limit>40)throw Error('WORK_INDEX_PAGE_BOUND_REQUIRED');
    const migration=await initialize();if(!migration.ready)return {ready:false,items:[],scanned:0};
    const head=await recover();let rows=await store.scanPrefix(prefix,{after_key:head.cursor?pointerKey(head.cursor):prefix,limit});
    if(!rows.length&&head.cursor)rows=await store.scanPrefix(prefix,{limit});
    const items=[];
    for(const row of rows){const p=row.value;
      if(!validId(p?.id)||!Number.isSafeInteger(p.seq)||p.seq<1||row.key!==pointerKey(p.seq))throw Error('WORK_INDEX_READY_REFERENCE_CONFLICT');
      if(p.seq>head.count)continue;
      const member=await store.get(await memberKey(p.id));if(member?.id!==p.id||member.seq!==p.seq)throw Error('WORK_INDEX_MEMBER_CONFLICT');
      if(member.status==='DONE'){await store.removeWorkPointer(row.key);continue;}
      if(member.status!=='ACTIVE')throw Error('WORK_INDEX_MEMBER_CONFLICT');items.push(p);
    }
    const last=rows.filter(row=>row.value.seq<=head.count).at(-1);
    if(advance&&last)await store.atomic(headKey,current=>({state:{...current,cursor:last.value.seq},result:true}));
    return {ready:true,items,scanned:rows.length};
  }
  return {initialize,ensureReady,add,complete,page};
}
