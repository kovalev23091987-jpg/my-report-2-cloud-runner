export const PUBLICATION_RETURN_ORDINARY_RUN_ID='pump-publication-recovery-return-20261030-ordinary-once';
export function createPublicationReturnOrdinarySqlPolicy(admission,now=Date.now()){
 const day='2026-10-30',id=PUBLICATION_RETURN_ORDINARY_RUN_ID;
 if(admission.lookup_single_exception!==undefined||admission.ordinary_lookup_day_utc!==day||new Date(now).toISOString().slice(0,10)!==day||
  admission.installation_readiness_ref!=='checkpoints/pump-report-20261025/ROOT_PUBLICATION_RECOVERY_INSTALL_READINESS_V1.json'||
  admission.mode!=='LOOKUP'||admission.run_id!==id||admission.native_query_cap!==16||
  admission.implementation_sha256!=='1941e629f35a0b429caa159c283f0bdeecb488c5c23be33c2b88a3840e59e355'||
  admission.target_artifact_sha256!=='1b4403a02c6d93a3555c5e1a0ce623c1e907a0edd52ce563878791cb7eba4378')throw Error('EXACT_CURRENT_DAY_ORDINARY_PUBLICATION_RETURN_LOOKUP_REQUIRED');
 let applied=false;
 return(sql,params)=>{
  if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return{sql,params};
  const clause='AND (?16=0 OR lookup_count<?17)';
  if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==day||params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||sql.split(clause).length!==2)throw Error('UNCHANGED_ORDINARY_LOOKUP_TEN_CAP_REQUIRED');
  applied=true;return{sql,params};
 };
}
