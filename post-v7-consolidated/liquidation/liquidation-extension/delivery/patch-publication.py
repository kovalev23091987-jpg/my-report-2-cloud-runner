from pathlib import Path
import hashlib
root=Path(__file__).parent
source=root/'baselines/canonical-publication.original.mjs'
def once(s,a,b):
 if s.count(a)!=1:raise ValueError(('EXACT_ANCHOR_NOT_UNIQUE',a[:90],s.count(a)))
 return s.replace(a,b)
s=source.read_text()
assert hashlib.sha256(s.encode()).hexdigest()=='ab96cd68e2f2770d7d71a9901cc7248dc5fdcded4c48f6ad7403ef47e2688248'
s="import {usesNativeLiquidationView,verifyNativeLiquidationView,nativeLiquidationPresentation,checkNativeTextParity} from './native-liquidation-publication.mjs';\n"+s
s=once(s,'function liquidationLines(c){const liq=',"function liquidationLines(c,options={}){const native=nativeLiquidationPresentation(c,options);if(native!==null)return native;const liq=")
s=once(s,' const lines=[ticker,dir,title,'," const nativeGate=verifyNativeLiquidationView(canonical,{lifecycle_event:event});if(!nativeGate.ok)return{ok:false,status:nativeGate.reason,text:null};\n const lines=[ticker,dir,title,")
s=once(s,'lines.push(...liquidationLines(canonical));lines.push(`Снимок рынка:', 'lines.push(...liquidationLines(canonical,{lifecycle_event:event}));lines.push(`Снимок рынка:')
s=once(s,"if(!['LONG','SHORT'].includes(d))return{ok:false,status:'DISPLAY_IDENTITY_NOT_CLOSED',text:null};const lines=['МОЙ ОТЧЁТ 2'", "if(!['LONG','SHORT'].includes(d))return{ok:false,status:'DISPLAY_IDENTITY_NOT_CLOSED',text:null};const nativeGate=verifyNativeLiquidationView(canonical,{lifecycle_event});if(!nativeGate.ok)return{ok:false,status:nativeGate.reason,text:null};const lines=['МОЙ ОТЧЁТ 2'")
s=once(s,'lines.push(...liquidationLines(canonical));return{ok:true','lines.push(...liquidationLines(canonical,{manual:true,lifecycle_event}));return{ok:true')
s=once(s,'export function validatePresentation({canonical,manual_text,telegram_text,direction}={})','export function validatePresentation({canonical,manual_text,telegram_text,direction,lifecycle_event=null}={})')
s=once(s," if(!text(manual_text)||!text(telegram_text))return fail('BOTH_PRESENTATIONS_REQUIRED');"," if(!text(manual_text)||!text(telegram_text))return fail('BOTH_PRESENTATIONS_REQUIRED');\n const nativeParity=checkNativeTextParity(canonical,{manual_text,telegram_text,lifecycle_event});if(!nativeParity.ok)return fail(nativeParity.reason);")
s=once(s,'validatePresentation({canonical,manual_text,telegram_text,direction});','validatePresentation({canonical,manual_text,telegram_text,direction,lifecycle_event});')
s=once(s," return {status:'CLOSED',ok:true,publication_id:p.publication_id,text:p.telegram_text", " const nativeFreshness=verifyNativeLiquidationView(canonical,{now_ms:now,lifecycle_event:b.lifecycle_event});if(!nativeFreshness.ok)return {status:nativeFreshness.reason,ok:false};\n const nativeParity=checkNativeTextParity(canonical,{manual_text:p.manual_text,telegram_text:p.telegram_text,lifecycle_event:b.lifecycle_event});if(!nativeParity.ok)return{status:nativeParity.reason,ok:false};\n return {status:'CLOSED',ok:true,native_liquidation_freshness:nativeFreshness,publication_id:p.publication_id,text:p.telegram_text")
start=s.index('export async function loadExactManual(');end=s.index('\n\nexport default ',start)
s=s[:start]+'''export async function loadExactManual(db,{publication_id,now_ts=null}={}){
 const p=await db.prepare(`SELECT publication_id,contract_code,direction,run_id,snapshot_id,observed_ts,valid_until_ts,lifecycle_event,manual_text,telegram_text,canonical_json,analytical_fingerprint,presentation_hash FROM canonical_publication_shadow WHERE publication_id=?1 AND actionability_status='ACTIONABLE' LIMIT 1`).bind(text(publication_id)).first();
 if(!p||!text(p.manual_text))return {status:'NOT_FOUND',ok:false};
 let canonical;try{canonical=JSON.parse(p.canonical_json);}catch{return {status:'CANONICAL_JSON_INVALID',ok:false};}
 const identity=validateCanonicalIdentity(canonical,{contract:p.contract_code,direction:p.direction,run_id:p.run_id,snapshot_id:p.snapshot_id,observed_ts:p.observed_ts});if(identity.status!=='CLOSED')return {...identity,ok:false};
 if(text(canonical.analytical_fingerprint)!==text(p.analytical_fingerprint))return {status:'CANONICAL_FINGERPRINT_MISMATCH',ok:false};
 const ph=sha256({manual_text:p.manual_text,telegram_text:p.telegram_text,analytical_fingerprint:p.analytical_fingerprint});if(ph!==p.presentation_hash)return {status:'PRESENTATION_CONTENT_MISMATCH',ok:false};
 if(now_ts!==null&&stamp(now_ts)===null)return {status:'MANUAL_CHECK_TIME_REQUIRED',ok:false};
 const checked=now_ts===null?canonical.observed_ts:now_ts;
 const nativeGate=verifyNativeLiquidationView(canonical,{now_ms:checked,lifecycle_event:p.lifecycle_event});if(!nativeGate.ok)return {status:nativeGate.reason,ok:false};
 const parity=checkNativeTextParity(canonical,{manual_text:p.manual_text,telegram_text:p.telegram_text,lifecycle_event:p.lifecycle_event});if(!parity.ok)return {status:parity.reason,ok:false};
 if(now_ts!==null&&p.valid_until_ts!==null&&p.valid_until_ts<now_ts&&p.lifecycle_event!=='IDEA_REMOVED')return {status:'PUBLICATION_EXPIRED',ok:false};
 return {status:'CLOSED',ok:true,text:p.manual_text,canonical,analytical_fingerprint:p.analytical_fingerprint,presentation_hash:p.presentation_hash,native_liquidation_freshness:nativeGate,live_freshness_checked:now_ts!==null,historical_only:now_ts===null};
}
'''+s[end:]
assert hashlib.sha256(s.encode()).hexdigest()=='c60ce541c9d9dbf514434aed39be589be7ba8ab5a5ac16676cb2e443324cb00d'
(root/'src/canonical-publication.mjs').write_text(s)
print('EXACT_PATCH_PARITY_WITH_SAVED_LOCAL_DELIVERY_PASS',hashlib.sha256(s.encode()).hexdigest())
