async () => {
  const a=__PUMP_CONFIG__;
  const check=(ok,reason)=>{if(!ok)throw Error(reason);};
  check(['READ_ONLY','PAUSE_AUTO','INSTALL','RESUME_AUTO'].includes(a.action),'ACTION');
  check(Date.now()>=a.issued_ts&&Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts,'ADMISSION_TIME');
  check(accountId==='70ee0af85191ea470e74c7383fdec772','ACCOUNT');
  const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  check(await sha('abc')==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','SHA_SELF_CHECK');
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
  const installAllowed=["analytics/cohort-audit.mjs","analytics/feature-capsule.mjs","analytics/saved-capsule-audit.mjs","runtime/budget.mjs","runtime/delivery.mjs","runtime/implementation-pin.mjs","runtime/outcome-journal.mjs","runtime/retained-capsules.mjs","runtime/runner.mjs","runtime/saved-statistics-audit.mjs","runtime/store.mjs","runtime/telegram-send.mjs","runtime/worker.mjs","sources/index.mjs"].sort();
  const removedAllowed=["analytics/capsule-version-reader.mjs","analytics/feature-capsule-v2.mjs","runtime/candidate-cost-quote-bridge.mjs","runtime/native-tail-guard.mjs","sources/candidate-route-cost.mjs"].sort(),deltaAllowed=["analytics/capsule-version-reader.mjs","analytics/cohort-audit.mjs","analytics/feature-capsule-v2.mjs","analytics/feature-capsule.mjs","analytics/saved-capsule-audit.mjs","runtime/budget.mjs","runtime/candidate-cost-quote-bridge.mjs","runtime/delivery.mjs","runtime/implementation-pin.mjs","runtime/native-tail-guard.mjs","runtime/outcome-journal.mjs","runtime/retained-capsules.mjs","runtime/runner.mjs","runtime/saved-statistics-audit.mjs","runtime/store.mjs","runtime/telegram-send.mjs","runtime/worker.mjs","sources/candidate-route-cost.mjs","sources/index.mjs"].sort();
  const digest64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)&&!/^0{64}$/.test(v);
  const frozenBeforePin='da52262978c5bb1037993b72d8b98c6185182e0a98d69fa3846ee6e21b7ed688';
  const frozenBeforeArtifact='8522aac0753fcfd471fd99d6920c30f0ab89ecf689f2726f9bb1986e715633a6';
  const frozenBeforeMap='85f920a697df1ab635c9048d9a265bf4907b08d2af60de5e19eb9c6dd8483bc4';
  const frozenAfterPin='1941e629f35a0b429caa159c283f0bdeecb488c5c23be33c2b88a3840e59e355',frozenAfterArtifact='2a1154eeccaa453d96c7b1a471722f8767ae2f71704fb820ccdbc79ceaefcca4',frozenAfterMap='350174cd02e013b713a075474c8d9aa8c324f4fbcda3f5bb6016f4c02f45dac4';
  const frozenTargetIndex='f1aaf18e882a6c8829104f0370abd842c3438d45e71d6ce945bffabbb5384186';
  const frozenRunnerProposal='df22e4a0c898ed236e4db25af9d00808b8873a0c8255b6b9c158d282afe36b94';
  check(a.schema==='ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1'&&a.status==='ADMITTED_NOT_SPENT'&&a.maximum_attempts===1&&a.admin_HTTP_max===(a.action==='READ_ONLY'?5:11),'POSITIVE_EXACT_ACTION_ADMISSION');
  if(a.action!=='INSTALL'){
    const isBefore=a.before_pin===frozenBeforePin,isAfter=a.before_pin===frozenAfterPin;
    check(isBefore||isAfter,'FROZEN_CONTROL_PIN_REQUIRED');
    const artifact=isBefore?frozenBeforeArtifact:frozenAfterArtifact,map=isBefore?frozenBeforeMap:frozenAfterMap;
    check(a.before_pin===a.after_pin&&a.before_artifact_sha256===artifact&&a.after_artifact_sha256===artifact,'CONTROL_ARTIFACT_UNCHANGED');
    check(await sha(canonical(a.before_modules_sha256))===map&&canonical(a.before_modules_sha256)===canonical(a.after_modules_sha256),'EXACT_CONTROL_MODULE_MAP');
  }
  const quiescent=()=>{
    const q=a.quiescence,now=Date.now();
    check(q?.state==='FINALIZED'&&q?.observation_status==='QUIESCENT_CODE_UPDATE_ALLOWED'&&q?.executor_owner===null&&q.implementation_sha256===a.before_pin&&Number.isSafeInteger(q.observed_ts)&&q.observed_ts<=now&&now-q.observed_ts<=300000,'ACTUAL_QUIESCENCE');
  };
  const checkPin=async(contents,hashMap,pin)=>{
    const hashes=Object.fromEntries(Object.entries(hashMap).filter(([n])=>n!=='runtime/implementation-pin.mjs'));
    check(Object.keys(hashMap).length===(pin===frozenBeforePin?83:78)&&Object.keys(hashes).length===Object.keys(hashMap).length-1&&await sha(canonical(hashes))===pin,'EXACT_COHERENT_PIN_HASH');
    const source=contents['runtime/implementation-pin.mjs'],prefix='export const IMPLEMENTATION_PIN=';
    check(typeof source==='string'&&source.startsWith(prefix)&&source.endsWith(';\n'),'EXACT_PIN_MODULE_SOURCE');
    const value=JSON.parse(source.slice(prefix.length,-2));
    check(canonical(Object.keys(value).sort())===canonical(['schema','sha256','modules','excluded_self_module'].sort())&&value.schema==='PUMP_BUNDLED_IMPLEMENTATION_PIN_V1'&&value.sha256===pin&&value.excluded_self_module==='runtime/implementation-pin.mjs'&&canonical(value.modules)===canonical(hashes),'PIN_MODULE_BINDING');
  };
  const checkInstallConfig=async()=>{
    check(a.schema==='ROOT_PRODUCTION_CONTROL_PLANE_ADMISSION_V1'&&a.status==='ADMITTED_NOT_SPENT'&&a.maximum_attempts===1&&a.admin_HTTP_max===11,'EXACT_ONE_INSTALL_ADMISSION');
    check(a.before_pin===frozenBeforePin&&a.before_artifact_sha256===frozenBeforeArtifact,'EXACT_PUBLICATION_BASE_REQUIRED');
    check(a.after_pin===frozenAfterPin&&a.after_artifact_sha256===frozenAfterArtifact,'EXACT_FROZEN_POSTLAUNCH_ARTIFACT_REQUIRED');
    const maps=[a.before_modules_sha256,a.after_modules_sha256];
    check(maps.every(m=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.values(m).every(digest64))&&Object.keys(maps[0]).length===83&&Object.keys(maps[1]).length===78,'EXACT_POSTLAUNCH_MODULE_MAPS_REQUIRED');
    check(await sha(canonical(maps[1]))===frozenAfterMap,'FROZEN_POSTLAUNCH_AFTER_MAP');
    check(await sha(canonical(a.before_modules_sha256))===frozenBeforeMap,'FROZEN_CURRENT78_PREIMAGE');
    check(canonical(Object.keys(maps[0]).filter(n=>!Object.hasOwn(maps[1],n)).sort())===canonical(removedAllowed),'EXACT_FROZEN_REMOVALS');
    const delta=[...new Set([...Object.keys(maps[0]),...Object.keys(maps[1])])].filter(n=>maps[0][n]!==maps[1][n]).sort();
    check(canonical(delta)===canonical(deltaAllowed),'EXACT_COHERENT_MODULE_DELTA');
    check(a.install_module_overrides&&typeof a.install_module_overrides==='object'&&!Array.isArray(a.install_module_overrides)&&canonical(Object.keys(a.install_module_overrides).sort())===canonical(installAllowed),'EXACT_FROZEN_OVERRIDE_NAMES');
    for(const [n,source]of Object.entries(a.install_module_overrides))check(typeof source==='string'&&await sha(source)===a.after_modules_sha256[n],'FROZEN_OVERRIDE_SOURCE_HASH');
    check(a.after_modules_sha256['runtime/runner.mjs']===frozenRunnerProposal,'EXACT_QUALIFIED_PUBLICATION_RUNNER');
    check(a.after_rules_version==="pump-analytics-v8-post-breach-20261029",'EXACT_UNCHANGED_RULES_REQUIRED');
    quiescent();
  };
  const base='/accounts/'+accountId+'/workers/scripts/';
  const names=['my-report-2-hub','my-report-2-free-history','my-report-2-liq-forecast-history'];
  let calls=0,mutated=false;
  const proof={schema:'ROOT_PRODUCTION_CONTROL_PLANE_READBACK_V1',transport:'EXISTING_CLOUDFLARE_CONNECTOR',authority_main:a.authority_main,action:a.action,started_ts:Date.now(),market_HTTP:0,native_SQL:0,Telegram:0,public_health_attempted:false,physical_admin_HTTP:'UNKNOWN_NONZERO_RETAINED'};
  const request=async(method,path,extra={})=>{
    check(Date.now()<a.expires_ts&&calls<a.admin_HTTP_max,'REQUEST_BOUND');
    check(names.some(n=>[base+n,base+n+'/settings',base+n+'/schedules',base+n+'/content'].includes(path)),'ROUTE');
    calls++;
    const r=await cloudflare.request({method,path,...extra});
    check(r.status===200&&r.success===true,'CF_HTTP_OR_ACK_'+r.status);
    return r.result;
  };
  const modules=async(raw,expected)=>{
    check(typeof raw==='string','SCRIPT_NOT_STRING');
    const end=raw.indexOf('\r\n'),boundary=raw.slice(0,end);
    check(end>2&&boundary.startsWith('--'),'MULTIPART_BOUNDARY');
    const chunks=raw.split(boundary);check(chunks[0]===''&&chunks.at(-1).startsWith('--'),'MULTIPART_END');
    const got={},contents={};
    for(const part of chunks.slice(1,-1)){
      check(part.startsWith('\r\n')&&part.endsWith('\r\n'),'PART_FRAMING');
      const split=part.indexOf('\r\n\r\n');check(split>0,'PART_HEADERS');
      const headers=part.slice(0,split),name=headers.match(/Content-Disposition:[^\r\n]*\bname="([^"]+)"/i)?.[1]??headers.match(/filename="([^"]+)"/i)?.[1];
      check(typeof name==='string'&&name.endsWith('.mjs')&&!Object.hasOwn(got,name),'PART_NAME');
      const body=part.slice(split+4,-2);got[name]=await sha(body);contents[name]=body;
    }
    check(canonical(got)===canonical(expected),'FULL_MODULE_HASH_MISMATCH');
    return {hashMap:got,contents};
  };
  const read=async(expected,auto)=>{
    const complete=await modules(await request('GET',base+names[0]),expected),hashMap=complete.hashMap;
    const settings=await request('GET',base+names[0]+'/settings');
    check(Array.isArray(settings.bindings)&&settings.bindings.length===21,'BINDING_COUNT');
    const bindings=Object.fromEntries(settings.bindings.map(b=>[b.name,b]));check(Object.keys(bindings).length===21,'BINDING_DUPLICATE');
    check(canonical(bindings.PUMP_REPORT_ENABLED)===canonical({name:'PUMP_REPORT_ENABLED',type:'plain_text',text:auto?'1':'0'}),'AUTO');
    check(canonical(bindings.PUMP_REPORT_DELIVERY_ENABLED)===canonical({name:'PUMP_REPORT_DELIVERY_ENABLED',type:'plain_text',text:'1'}),'DELIVERY');
    check((bindings.DATA_DB?.id??bindings.DATA_DB?.database_id)==='057a2847-2cc4-4e52-8534-1be1596d21d5','DATA_DB');
    const crons={};for(const n of names){const s=await request('GET',base+n+'/schedules');crons[n]=s.schedules.map(x=>x.cron);}
    check(canonical(crons)===canonical(Object.fromEntries(names.map((n,i)=>[n,i===0?['*/5 7-16 * * *']:[]]))),'OLD_PAUSES_AND_CRONS');
    return {hashMap,moduleContents:complete.contents,settings,bindings,crons};
  };
  try{
    if(a.action==='INSTALL')await checkInstallConfig();
    const before=await read(a.before_modules_sha256,a.action==='PAUSE_AUTO'||a.action==='READ_ONLY');
    let after=before;
    if(a.action!=='READ_ONLY'){
      const boundary='----pump-safe-'+a.issued_ts;let path,method,body;
      if(a.action==='INSTALL'){
        quiescent();
        check(canonical(Object.keys(a.install_module_overrides).sort())===canonical(installAllowed),'EXACT_QUALIFIED_MODULE_OVERRIDES');
        const installModules={...before.moduleContents,...a.install_module_overrides};
        for(const name of removedAllowed)delete installModules[name];
        check(canonical(Object.keys(installModules).sort())===canonical(Object.keys(a.after_modules_sha256).sort()),'INSTALL_MODULE_NAMES');
        for(const [n,s]of Object.entries(installModules))check(await sha(s)===a.after_modules_sha256[n],'INSTALL_SOURCE_HASH');
        check(a.after_modules_sha256['analytics/index.mjs']===frozenTargetIndex&&installModules['analytics/index.mjs'].includes("export const RULES_VERSION='"+a.after_rules_version+"';"),'EXACT_QUALIFIED_TARGET_CONTEXT_INDEX');
        await checkPin(before.moduleContents,before.hashMap,a.before_pin);
        await checkPin(installModules,a.after_modules_sha256,a.after_pin);
        const part=(name,type,s)=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+name+'"\r\nContent-Type: '+type+'\r\n\r\n'+s+'\r\n';
        body=part('metadata','application/json',JSON.stringify({main_module:a.main_module}));
        check(a.main_module==='worker-entry.mjs','MAIN_MODULE');
        for(const [n,s]of Object.entries(installModules))body+=part(n,'application/javascript+module',s);
        body+='--'+boundary+'--\r\n';path=base+names[0]+'/content';method='PUT';
      }else{
        const settings={bindings:before.settings.bindings.map(b=>b.name==='PUMP_REPORT_ENABLED'?{name:b.name,type:'plain_text',text:a.action==='RESUME_AUTO'?'1':'0'}:{name:b.name,type:'inherit'})};
        if(before.settings.annotations)settings.annotations=Object.fromEntries(Object.entries(before.settings.annotations).filter(([k])=>['workers/message','workers/tag'].includes(k)));
        body='--'+boundary+'\r\nContent-Disposition: form-data; name="settings"\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(settings)+'\r\n--'+boundary+'--\r\n';path=base+names[0]+'/settings';method='PATCH';
      }
      await request(method,path,{body,contentType:'multipart/form-data; boundary='+boundary,rawBody:true});mutated=true;
      after=await read(a.after_modules_sha256,a.action==='RESUME_AUTO');
      if(a.action==='INSTALL')check(canonical(before.settings)===canonical(after.settings),'INSTALL_SETTINGS_CHANGED');
      else{
        const strip=b=>Object.fromEntries(Object.entries(b).filter(([k])=>k!=='PUMP_REPORT_ENABLED'));
        check(canonical(strip(before.bindings))===canonical(strip(after.bindings)),'OTHER20_BINDINGS_CHANGED');
        const nonBindings=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['bindings','annotations'].includes(k)));
        check(canonical(nonBindings(before.settings))===canonical(nonBindings(after.settings)),'OTHER_SETTINGS_CHANGED');
      }
      check(canonical(before.crons)===canonical(after.crons),'SCHEDULES_CHANGED');
    }
    Object.assign(proof,{state:'CONFIRMED_FULL',readback_ts:Date.now(),artifact_sha256:a.after_artifact_sha256,implementation_sha256:a.after_pin,module_count:Object.keys(after.hashMap).length,FULL_exact_module_bytes:true,FULL_method:'Complete multipart modules UTF8 SHA256 equality to every frozen artifact module',module_sha256:after.hashMap,bindings_count:21,all3_schedules:after.crons,other20bindings_exact:a.action!=='READ_ONLY',control_plane:{automatic_enabled:a.action==='RESUME_AUTO'||a.action==='READ_ONLY',delivery_enabled:true,provider_stage:'PRODUCTION_QUALIFIED',DATA_DB_id:'057a2847-2cc4-4e52-8534-1be1596d21d5',basis:'Actual full script module hashes and live settings/schedules through existing connector'}});
  }catch(e){Object.assign(proof,{state:'FAILED_OR_UNKNOWN_NO_RETRY',error:String(e.message??e).slice(0,200)});}
  Object.assign(proof,{completed_ts:Date.now(),read_only_and_mutation_admin_HTTP_attempted:calls,mutation_acknowledged:mutated,no_auto_retry:true});return proof;
}
