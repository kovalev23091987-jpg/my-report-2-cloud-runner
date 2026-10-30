export const PUBLICATION_RECOVERY_ORDINARY_RUN_ID='pump-publication-recovery-install-20261030-ordinary-once';
export function createPublicationRecoveryOrdinarySqlPolicy(admission,now=Date.now()){
 const day='2026-10-30',id=PUBLICATION_RECOVERY_ORDINARY_RUN_ID;
 if(admission.lookup_single_exception!==undefined||admission.ordinary_lookup_day_utc!==day||new Date(now).toISOString().slice(0,10)!==day||
  admission.installation_readiness_ref!=='checkpoints/pump-report-20261025/ROOT_PUBLICATION_RECOVERY_INSTALL_READINESS_V1.json'||
  admission.mode!=='LOOKUP'||admission.run_id!==id||admission.native_query_cap!==16||
  admission.implementation_sha256!=='dfd7b37b9ce06ba3ce6b7a06ae0f7e17e2fafffc198aaa292185c97d18450452'||
  admission.target_artifact_sha256!=='2a1154eeccaa453d96c7b1a471722f8767ae2f71704fb820ccdbc79ceaefcca4')throw Error('EXACT_CURRENT_DAY_ORDINARY_PUBLICATION_LOOKUP_REQUIRED');
 let applied=false;
 return(sql,params)=>{
  if(!sql.startsWith('INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow('))return{sql,params};
  const clause='AND (?16=0 OR lookup_count<?17)';
  if(applied||params[0]!=='PUMP:LOOKUP:'+id||params[1]!==day||params[2]!==500||params[3]!==30||params[15]!==1||params[16]!==10||sql.split(clause).length!==2)throw Error('UNCHANGED_ORDINARY_LOOKUP_TEN_CAP_REQUIRED');
  applied=true;return{sql,params};
 };
}
