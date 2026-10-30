import {positive, validTime} from '../contracts/index.mjs';

export const ANCHOR_POLICY_VERSION='pump-original-card-anchor-v1-tz2-20261025';
const text=v=>typeof v==='string'&&v.trim().length>0;
const stable=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const compare=(a,b)=>a.event_ts-b.event_ts||a.recorded_ts-b.recorded_ts||String(a.event_id).localeCompare(String(b.event_id),'en');
function validOrigin(o){return o&&['instrument_id','asset_id','wave_id','signal_id','rules_version','profile_version'].every(k=>text(o[k]))&&validTime(o.t0)&&positive(o.reference_price)&&
  ['AUTO','MANUAL'].includes(o.mode)&&['NO_MAP','PARTIAL_MAP','MAP'].includes(o.map_mode)&&['OBSERVED','ARTIFICIAL','NON_NATIVE','BACKFILLED','UNCLASSIFIED'].includes(o.evidence_class)&&typeof o.ready==='boolean';}
const sent=p=>p.state==='SENT'&&/^[1-9][0-9]*$/.test(String(p.message_id??''))&&text(p.receipt_ref);

// Pure selection of a saved card, not a delivery journal or provenance authenticator.
// ROOT supplies immutable normalized origins, a complete append-only publication ledger,
// the original wave expiry and (on subsequent calls) the saved immutable published anchor.
export function selectOutcomeAnchor({analyses,publications,as_of_ts,wave_expires_ts,terminal=null,frozen_anchor=null}){
  if(!Array.isArray(analyses)||!Array.isArray(publications)||!validTime(as_of_ts)||!validTime(wave_expires_ts))throw Error('ANCHOR_INPUT_REQUIRED');
  const finish=(status,reason,anchor=null,publication=null)=>({version:ANCHOR_POLICY_VERSION,status,reason,eligible:status==='ELIGIBLE',anchor:structuredClone(anchor),
    summary_origin:status==='ELIGIBLE'?structuredClone(anchor.origin):null,publication:structuredClone(publication),input_mutated:false,raw_persistence_verified:false,external_provenance_authenticated:false});
  const snapshots=new Map();let identity=null;
  for(const row of analyses){
    if(validTime(row?.recorded_ts)&&row.recorded_ts>as_of_ts)continue;
    if(!text(row?.analysis_id)||!/^[a-f0-9]{64}$/.test(row.analysis_sha256??'')||!validOrigin(row.origin)||!validTime(row.recorded_ts)||row.recorded_ts<row.origin.t0||
      !validTime(row.features_known_ts)||row.features_known_ts>row.origin.t0)return finish('QUARANTINED','INVALID_OR_FUTURE_FEATURE_SNAPSHOT');
    const key=stable([row.origin.instrument_id,row.origin.asset_id,row.origin.wave_id]);
    if(identity&&identity!==key)return finish('QUARANTINED','CROSS_WAVE_OR_ASSET_INPUT');identity=key;
    const old=snapshots.get(row.analysis_id);if(old&&stable(old)!==stable(row))return finish('QUARANTINED','IMMUTABLE_ANALYSIS_ID_CONFLICT');
    snapshots.set(row.analysis_id,row);
  }
  const ready=[...snapshots.values()].filter(r=>r.origin.ready).sort((a,b)=>a.recorded_ts-b.recorded_ts||a.origin.t0-b.origin.t0||a.analysis_id.localeCompare(b.analysis_id,'en'));
  if(!ready.length)return finish('PENDING','NO_READY_SNAPSHOT');
  if(wave_expires_ts<=ready[0].origin.t0)return finish('QUARANTINED','WAVE_EXPIRY_BEFORE_FIRST_READY');
  const events=new Map();
  for(const event of publications){
    if(validTime(event?.recorded_ts)&&event.recorded_ts>as_of_ts)continue;
    if(!text(event?.event_id)||!text(event.analysis_id)||!['SENT','UNKNOWN','FAILED'].includes(event.state)||!validTime(event.event_ts)||
      !validTime(event.recorded_ts)||event.recorded_ts<event.event_ts||event.event_ts>as_of_ts)return finish('QUARANTINED','INVALID_PUBLICATION_EVENT');
    const row=snapshots.get(event.analysis_id);
    if(!row||!row.origin.ready||event.event_ts<row.origin.t0||event.event_ts<row.recorded_ts)return finish('QUARANTINED','PUBLICATION_NOT_BOUND_TO_SAVED_READY');
    const old=events.get(event.event_id);if(old&&stable(old)!==stable(event))return finish('QUARANTINED','IMMUTABLE_PUBLICATION_EVENT_CONFLICT');
    if(event.state==='UNKNOWN'&&event.possible_send!==true)return finish('QUARANTINED','UNKNOWN_SEND_POSSIBILITY_UNRESOLVED');
    events.set(event.event_id,event);
  }
  // A malformed SENT is conservatively a possible send, never a failed draft.
  const candidates=[...events.values()].filter(e=>e.state==='SENT'||e.state==='UNKNOWN'&&e.possible_send===true).sort(compare);
  const first=candidates[0];
  if(!first&&ready.some(r=>r.recorded_ts===ready[0].recorded_ts&&r.origin.t0===ready[0].origin.t0&&stable(r.origin)!==stable(ready[0].origin)))return finish('QUARANTINED','SIMULTANEOUS_FIRST_READY_AMBIGUOUS');
  if(first&&candidates.some(e=>e.event_ts===first.event_ts&&e.recorded_ts===first.recorded_ts&&e.analysis_id!==first.analysis_id))return finish('QUARANTINED','SIMULTANEOUS_ORIGINAL_CARDS_AMBIGUOUS');
  const row=first?snapshots.get(first.analysis_id):ready[0];
  if(!first&&terminal!==null&&(!validTime(terminal.event_ts)||!validTime(terminal.recorded_ts)||terminal.recorded_ts<terminal.event_ts||
    !['CANCELLED','EXPIRED','COMPLETED'].includes(terminal.state)))return finish('QUARANTINED','INVALID_TERMINAL_EVENT');
  const closed=!first&&(wave_expires_ts<=as_of_ts||terminal&&terminal.event_ts<=as_of_ts&&terminal.recorded_ts<=as_of_ts&&terminal.event_ts>=row.origin.t0);
  const anchor={analysis_id:row.analysis_id,analysis_sha256:row.analysis_sha256,origin:structuredClone(row.origin),immutable:Boolean(first||closed),selection:{kind:first?'FIRST_POSSIBLE_OR_CONFIRMED_SEND':'FIRST_READY',
    selected_ts:first?.event_ts??row.recorded_ts,recorded_ts:first?.recorded_ts??row.recorded_ts,publication_event_id:first?.event_id??null}};
  if(frozen_anchor?.immutable===true&&stable(anchor)!==stable(frozen_anchor))return finish('QUARANTINED','PUBLISHED_ORIGINAL_CHANGED_OR_LEDGER_INCOMPLETE');
  if(first){
    // Only a receipt bound to this saved card can resolve its UNKNOWN publication.
    const confirmed=candidates.find(e=>e.analysis_id===row.analysis_id&&sent(e));
    return finish('ELIGIBLE',null,anchor,confirmed?{state:'SENT',message_id:String(confirmed.message_id),receipt_ref:confirmed.receipt_ref}:{state:'UNKNOWN',message_id:null,receipt_ref:null});
  }
  return closed?finish('ELIGIBLE',null,anchor,{state:'UNSENT',message_id:null,receipt_ref:null}):finish('PENDING','NEVER_SENT_WAVE_STILL_ACTIVE',anchor);
}
