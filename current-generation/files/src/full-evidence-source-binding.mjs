import {normalizeInheritedFactEnvelope} from './inherited-fact-contract.mjs';
import {checkExecutionHandoff} from './tz101-execution-facts.mjs';
import {digest,stableJson} from './upstream-proof-utils.mjs';

const text=v=>v==null?'':String(v).trim();
const stamp=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1e12?v:null;
const projection=r=>({chain:text(r.chain).toUpperCase(),source_observation_id:text(r.source_observation_id),source_payload_digest:text(r.source_payload_digest),source:text(r.source),venue:text(r.venue),metric:text(r.metric),source_ts:stamp(r.source_ts),available_ts:stamp(r.available_ts),valid_until_ts:stamp(r.valid_until_ts),max_age_sec:Number.isSafeInteger(r.max_age_sec)?r.max_age_sec:null,producer_rules_version:text(r.producer_rules_version),safety_gate_receipt_id:text(r.safety_gate_receipt_id)||null});

// Data conversion only. It does not declare a D1 insert acknowledged and cannot
// authorize delivery. Offline replay may use an exact persisted readback here.
export function collectFullEvidenceSourceFacts(bundle,{contract,snapshot_id,observed_ts}={}){
 const f=bundle?.full_evidence,r=f?.source_registry;
 if(!contract||!snapshot_id||stamp(observed_ts)===null||bundle?.contract_code!==contract||bundle.snapshot_id!==snapshot_id||bundle.observed_ts!==observed_ts||f?.contract_code!==contract||f.snapshot_id!==snapshot_id||f.observed_ts!==observed_ts||r?.status!=='CLOSED'||r.authoritative!==true||!text(r.receipt_id)||!Array.isArray(r.entries)||digest(r.entries)!==r.content_digest)return [];
 const entries=new Map();
 for(const entry of r.entries){const group=entries.get(entry.source_observation_id)||[];group.push(entry);entries.set(entry.source_observation_id,group);}
 const rows=(Array.isArray(f.evidence_compact)?f.evidence_compact:[]).slice(0,32).filter(x=>{
  if(x.contract_code!==contract||x.snapshot_id!==snapshot_id||x.source_receipt_id!==r.receipt_id||x.producer_rules_version!=='full-evidence-source-producer-v1'||x.status!=='CLOSED'||x.error||x.source_compatible!==true||x.symbol_verified!==true||x.asset_identity_verified!==true||(x.alias_required===true&&x.alias_verified!==true))return false;
  const matches=entries.get(x.source_observation_id)||[];
  if(!matches.some(entry=>stableJson(projection(x))===stableJson(entry)))return false;
  const rawDigest=digest([contract,snapshot_id,text(x.source),text(x.venue),text(x.metric),stamp(x.source_ts),stamp(x.available_ts),stamp(x.valid_until_ts),Number.isSafeInteger(x.max_age_sec)?x.max_age_sec:null,x.value??null,Number.isFinite(x.coverage_pct)?x.coverage_pct:null]);
  if(rawDigest!==x.source_payload_digest||x.source_observation_id!==`FSO:${rawDigest}`||stamp(x.available_ts)===null||x.available_ts>observed_ts||stamp(x.source_ts)===null||x.max_age_sec<=0||x.valid_until_ts!==x.source_ts+x.max_age_sec*1000||x.valid_until_ts<observed_ts)return false;
  // Old OKX exact-base aliases can refer to stock contracts. Their archived
  // ticker alone cannot prove a crypto asset class.
  if(text(x.venue).toUpperCase()==='OKX'&&x.asset_class!=='CRYPTO')return false;
  if(text(x.metric).toUpperCase()==='EXECUTION_GATE_STATUS')return x.chain==='HTX_EXECUTION'&&x.source_kind==='HTX_EXECUTION_GATE'&&x.venue==='HTX'&&x.value===1&&x.safety_gate_receipt_id===bundle.safety_gate_receipt?.receipt_id&&checkExecutionHandoff(bundle.execution_gate,{contract_code:contract,checked_ts:observed_ts}).ok===true;
  return ['GREEN','OK','CLOSED'].includes(text(x.quality_status||x.source_health).toUpperCase());
 }).map(x=>({...x,received_ts:x.available_ts,...(text(x.metric).toUpperCase()==='EXECUTION_GATE_STATUS'?{quality_status:'CLOSED'}:{})}));
 // A producer can reuse the same observation in more than one research chain.
 // Its known origin remains one fact and one independent source, never votes.
 const unique=[...new Map(rows.map(row=>[row.source_observation_id,row])).values()];
 return normalizeInheritedFactEnvelope(unique).facts;
}

// Live admission accepts only the producer's exact D1-ACK-sealed snapshot.
export function sealedFullEvidenceSourceReceipts(proof,context={}){
 const b=proof?.bundle;
 if(proof?.status!=='CLOSED'||stamp(b?.committed_ts)===null||b.committed_ts<b.observed_ts)return [];
 const receipts=[b.full_evidence?.persistence,b.full_evidence?.source_registry?.persistence,b.safety_gate_receipt?.persistence];
 if(receipts.some(p=>p?.status!=='CLOSED'||p.immutable!==true||p.verification_method!=='D1_IMMUTABLE_RECEIPT'||p.committed_ts!==b.committed_ts))return [];
 return collectFullEvidenceSourceFacts(b,context);
}
