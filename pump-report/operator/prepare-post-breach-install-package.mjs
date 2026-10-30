import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const once=(s,from,to)=>{if(s.split(from).length!==2)throw Error('EXACT_GENERATOR_PREIMAGE_REQUIRED:'+from.slice(0,80));return s.replace(from,to);};
const canonical=o=>JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a],[b])=>a<b?-1:a>b?1:0)));

// Called only by one separately admitted offline qualification. This creates
// prepared files, never an IO admission, owner grant, deployment or SQL call.
export function preparePostBreachInstallPackage({base_artifact,artifact,artifact_sha256,rules_version}){
  const expected={
    'pump-report/operator/target-plan-owner13-14-sql-exception.mjs':'9724c6eee2427d15db41f19b5efc6593ac0fa2fc8e69374a6d655ed09f0e373e',
    'pump-report/operator/target-plan-install13-quiescence-once.mjs':'0a29262651e164964110bdc2391a79e77753292b55c4f3c2b77fa097d3eafe71',
    'pump-report/operator/target-plan-acceptance14-once.mjs':'4eeb093466a7ff7900878bcc54283bf14eab4b2e33888bab8029fa6b7fb48c0d',
    'pump-report/operator/cloudflare-target-plan-control.template.js':'d6a5b90494051a2aa91cf813c53a1abb8234f8b4cf800156eeeba84958bff143',
    'pump-report/operator/current-analysis-selected-run-packet.mjs':'2eff0933318c9eadab86b2e3c7220da943376b9edfe3a1e26cd78ccb57defdd4'};
  const source={};for(const[p,h]of Object.entries(expected)){const b=fs.readFileSync(p);if(sha(b)!==h)throw Error('GENERATOR_SOURCE_CHANGED:'+p);source[p]=b.toString('utf8');}
  const beforePin='930905e4840003ab8e28ac2482d2915980bba2b3c4d9ccce0a103cb48a286531',pin=artifact.manifest.implementation_pin.sha256;
  if(base_artifact.manifest.implementation_pin.sha256!==beforePin||pin===beforePin||!/^[a-f0-9]{64}$/.test(artifact_sha256))throw Error('EXACT_CHANGED_ARTIFACT_REQUIRED');
  const hashes=o=>Object.fromEntries(Object.entries(o.modules).map(([n,s])=>[n,sha(s)])),before=hashes(base_artifact),after=hashes(artifact);
  if(Object.keys(before).length!==76||Object.keys(before).some(n=>!Object.hasOwn(after,n)))throw Error('PRESERVE_ALL_76_BEFORE_MODULES');
  const changed=Object.keys(after).filter(n=>before[n]!==after[n]).sort(),count=Object.keys(after).length;
  const out={},gatePath='pump-report/operator/post-breach-owner15-16-sql-exception.mjs';
  let gate=source['pump-report/operator/target-plan-owner13-14-sql-exception.mjs'];
  gate=once(gate,gate.split('\n')[0],"export const POST_BREACH_LOOKUP_IDS=Object.freeze({15:'pump-post-breach-install-20261029-extra15',16:'pump-post-breach-auto-acceptance-20261029-extra16'});");
  gate=gate.replaceAll('TARGET_PLAN_LOOKUP_IDS','POST_BREACH_LOOKUP_IDS').replaceAll('createTargetPlanNamedSqlException','createPostBreachNamedSqlException')
    .replaceAll('OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1','OWNER_POST_BREACH_INSTALL_AND_ACCEPTANCE_15_16_V1');
  gate=once(gate,"const beforePin='27258b810da32584cde054712e72be67e84d004e9af4874a4755a816e9c55bdf';","const beforePin='"+beforePin+"';");
  gate=once(gate,"const afterPin='"+beforePin+"';","const afterPin='"+pin+"';");
  gate=once(gate,"'a799fe2fb70b3a2b71332acc5ba89d80352851394767e58bd16569f81fc21154'",JSON.stringify(artifact_sha256));
  gate=once(gate,'[POST_BREACH_LOOKUP_IDS[13],POST_BREACH_LOOKUP_IDS[14]]','[POST_BREACH_LOOKUP_IDS[15],POST_BREACH_LOOKUP_IDS[16]]');
  gate=once(gate,'n===13?beforePin:afterPin','n===15?beforePin:afterPin');
  out[gatePath]=gate;
  for(const[kind,n,old]of[['install',15,13],['acceptance',16,14]]){
    let s=source['pump-report/operator/target-plan-'+(kind==='install'?'install13-quiescence':'acceptance14')+'-once.mjs']
      .replaceAll('createTargetPlanNamedSqlException','createPostBreachNamedSqlException').replaceAll('./target-plan-owner13-14-sql-exception.mjs','./post-breach-owner15-16-sql-exception.mjs')
      .replaceAll('OWNER_TARGET_PLAN_INSTALL_AND_ACCEPTANCE_13_14_V1','OWNER_POST_BREACH_INSTALL_AND_ACCEPTANCE_15_16_V1');
    s=once(s,'extra_number!=='+old,'extra_number!=='+n);s=once(s,'evidence.owner_extra_number='+old,'evidence.owner_extra_number='+n);
    if(kind==='install')s=once(s,'extra_number:13','extra_number:15');
    else {
      s=s.replaceAll('readCurrentAnalysisPacket','readCurrentSelectedRunAnalysisPacket').replaceAll('./current-analysis-packet.mjs','./current-analysis-selected-run-packet.mjs')
        .replaceAll('PUMP_CURRENT_ANALYSIS_PACKET_ADMISSION_V1','PUMP_CURRENT_SELECTED_RUN_ANALYSIS_PACKET_ADMISSION_V1');
      s=once(s,'!Number.isSafeInteger(admission.after_install_ts)||admission.after_install_ts>now','!Number.isSafeInteger(admission.after_install_ts)||admission.after_install_ts<=0||admission.after_install_ts>now');
    }
    out['pump-report/operator/post-breach-'+(kind==='install'?'install15-quiescence':'acceptance16')+'-once.mjs']=s;
  }
  let ctl=source['pump-report/operator/cloudflare-target-plan-control.template.js'];
  ctl=once(ctl,"const installAllowed=['runtime/runner.mjs','analytics/movement.mjs','analytics/index.mjs','analytics/presentation.mjs','runtime/implementation-pin.mjs'].sort();",'const installAllowed='+JSON.stringify(changed)+'.sort();');
  ctl=once(ctl,"const frozenBeforePin='27258b810da32584cde054712e72be67e84d004e9af4874a4755a816e9c55bdf';","const frozenBeforePin='"+beforePin+"';");
  ctl=once(ctl,"const frozenBeforeArtifact='841f2a3c850d01257f3f4041ec7a2931c8779691156402c47faed8ace739e8a0';","const frozenBeforeArtifact='a799fe2fb70b3a2b71332acc5ba89d80352851394767e58bd16569f81fc21154';");
  ctl=once(ctl,"const frozenBeforeMap='f4016347be04eeb483b924fe47ed7cf0ed0a766aa2e581fb1885eea207f14b6b';","const frozenBeforeMap='"+sha(canonical(before))+"';\n  const frozenAfterPin='"+pin+"',frozenAfterArtifact='"+artifact_sha256+"',frozenAfterMap='"+sha(canonical(after))+"';");
  ctl=once(ctl,"const frozenTargetIndex='fa0a1e13fcad7201d2083bc536da048a3addcb645828d7a15e01438c373d7ddb';","const frozenTargetIndex='"+after['analytics/index.mjs']+"';");
  ctl=once(ctl,'Object.keys(hashMap).length===76&&Object.keys(hashes).length===75','Object.keys(hashMap).length===(pin===frozenBeforePin?76:'+count+')&&Object.keys(hashes).length===(pin===frozenBeforePin?75:'+(count-1)+')');
  ctl=once(ctl,"check(digest64(a.after_pin)&&a.after_pin!==a.before_pin&&digest64(a.after_artifact_sha256)&&a.after_artifact_sha256!==a.before_artifact_sha256,'FROZEN_NEW_ARTIFACT_REQUIRED');","check(a.after_pin===frozenAfterPin&&a.after_artifact_sha256===frozenAfterArtifact,'EXACT_FROZEN_POST_BREACH_ARTIFACT_REQUIRED');");
  ctl=once(ctl,"check(maps.every(m=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.keys(m).length===76&&Object.values(m).every(digest64)),'EXACT76_MODULE_MAPS_REQUIRED');","check(maps.every(m=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.values(m).every(digest64))&&Object.keys(maps[0]).length===76&&Object.keys(maps[1]).length==="+count+",'EXACT_POST_BREACH_MODULE_MAPS_REQUIRED');\n    check(await sha(canonical(maps[1]))===frozenAfterMap,'FROZEN_POST_BREACH_AFTER_MAP');");
  ctl=once(ctl,"check(canonical(Object.keys(maps[0]).sort())===canonical(Object.keys(maps[1]).sort()),'NO_MODULE_ADDITION_OR_REMOVAL');","check(Object.keys(maps[0]).every(n=>Object.hasOwn(maps[1],n))&&Object.keys(maps[1]).every(n=>Object.hasOwn(maps[0],n)||installAllowed.includes(n)),'ONLY_QUALIFIED_MODULE_ADDITIONS_NO_REMOVALS');");
  ctl=once(ctl,'const delta=Object.keys(maps[0]).filter(n=>maps[0][n]!==maps[1][n]).sort();','const delta=Object.keys(maps[1]).filter(n=>maps[0][n]!==maps[1][n]).sort();');
  ctl=once(ctl,"a.after_rules_version==='pump-analytics-v7-targets-20261029'",'a.after_rules_version==='+JSON.stringify(rules_version));
  out['pump-report/operator/cloudflare-post-breach-control.template.js']=ctl;
  for(const[p,s]of Object.entries(out))fs.writeFileSync(p,s,{flag:'wx',mode:0o600});
  return {files:Object.entries(out).map(([path,text])=>({path,sha256:sha(text)})),changed_modules:changed,module_count:count,generated_only:true,real_IO:0,owner_15_16_approval:false};
}
