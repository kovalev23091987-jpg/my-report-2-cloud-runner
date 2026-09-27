import crypto from 'node:crypto';
export const SCORE_ORIGIN_READER_VERSION='post-v7-score-origin-reader-v2-20260926';
const text=v=>v==null?'':String(v).trim();
const stable=v=>Array.isArray(v)?v.map(stable):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v);
const fingerprint=result=>{const x={...(result||{})};delete x.analytical_fingerprint;return crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');};
const finiteScore=v=>v===null?null:(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?v:undefined);
export function readCanonicalPublicationScores(result,expectedInput){
 const expected=expectedInput&&typeof expectedInput==='object'&&!Array.isArray(expectedInput)?expectedInput:{};
 const empty=reason=>({status:'NOT_CLOSED',reason,scores:null});
 const id=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&!v.startsWith('UNBOUND:');
 const direction=text(expected.direction).toUpperCase();
 if(result?.status!=='CLOSED')return empty('CANONICAL_RESULT_MISSING');
 if(!id(expected.snapshot_id)||!id(expected.run_id)||!id(expected.contract)||!['LONG','SHORT'].includes(direction)||!Number.isSafeInteger(expected.observed_ts))return empty('SCORE_BINDING_REQUIRED');
 if(result.snapshot_id!==expected.snapshot_id||result.run_id!==expected.run_id||result.observed_ts!==expected.observed_ts||text(result.direction).toUpperCase()!==direction)return empty('SCORE_IDENTITY_MISMATCH');
 const declared=[result.metadata?.contract,...(Array.isArray(result.candidates)?result.candidates.map(r=>r?.contract??r?.ticker):[])].filter(v=>v!=null);
 if(!declared.length||declared.some(c=>text(c)!==expected.contract))return empty('SCORE_CONTRACT_MISMATCH');
 if(text(result.analytical_fingerprint)!==fingerprint(result))return empty('CANONICAL_CONTENT_MISMATCH');
 const source=result.scores;if(!source||source.is_probability!==false)return empty('SCORE_SEMANTICS_NOT_CLOSED');
 const keys=['overall_0_100','coin_interest_0_100','entry_readiness_0_100'];
 for(const k of keys){const v=finiteScore(source[k]);if(v===undefined)return empty('CANONICAL_SCORE_OUT_OF_RANGE');}
 return {status:'CLOSED',reason:null,snapshot_id:result.snapshot_id,run_id:result.run_id,scores:{overall_0_100:source.overall_0_100,coin_interest_0_100:source.coin_interest_0_100,entry_readiness_0_100:source.entry_readiness_0_100,is_probability:false}};
}
export default{SCORE_ORIGIN_READER_VERSION,readCanonicalPublicationScores};
