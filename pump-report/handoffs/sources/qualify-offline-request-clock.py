"""Finite offline static review. Does not import/evaluate downloaded JavaScript."""
from pathlib import Path
import hashlib,json,re,time
B=Path(__file__).resolve().parent
ROOT=B.parent.parent.parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,j):(B/n).write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
A=json.loads((B/'CLOCK_CONTRACT_AUTHORITY_V1.json').read_text())
assert time.time()*1000<A['lease']['expires_ts']
frozen=ROOT/A['previous_frozen_package']['path']
assert sha(frozen.read_bytes())==A['previous_frozen_package']['sha256']
F={
 'CORE':('/private/tmp/bingx-taxonomy-static-api-core.js','0637057d5eaaf7c03ed912f0984aded646b0659bc39ff106b9a7ca70df259e89'),
 'UTILITY':('/private/tmp/bingx-full-universe-CeOxKRS_.js','9b16e69d45024775c267abcefb0df846237c3a74889be6d419675e11716137ce'),
 'PLUGIN':('/private/tmp/bingx-full-universe-api-plugin.js','0a0aa922b666b7de45f663afa3e63b192d9c3acdbc9e406c76bc4e7817de3449'),
 'CONSTANTS':('/private/tmp/bingx-taxonomy-static-services.js','8eca3b723263437f2486bd641bf03c458138ad59daa7d810f3ca190866af06a7')}
blobs={}
for k,(p,h) in F.items():
 b=Path(p).read_bytes();assert sha(b)==h,(k,sha(b));blobs[k]=b
spans=[]
def span(label,key,start,end,include_end=False):
 b=blobs[key];st=start.encode();en=end.encode();assert b.count(st)==1,(label,b.count(st))
 x=b.index(st);y=b.index(en,x)+(len(en) if include_end else 0);p=b[x:y];assert p
 spans.append({'id':label,'file':F[key][0],'file_sha256':F[key][1],'byte_start':x,'byte_end_exclusive':y,'span_sha256':sha(p),'bytes':len(p),'start_anchor':start,'end_anchor':end,'end_anchor_included':include_end,'executed':False})
 return p.decode()
method=span('ENDPOINT_NO_PARAMS','PLUGIN','requestCoinInfoList(){','getNotificationListGroup(){')
assert method=='requestCoinInfoList(){return this.request({method:"GET",url:"/coin/v1/display-info/list"})}'
registration=span('PLUGIN_BASE_REQUEST','PLUGIN','const Ji=tt(i=>','Qi=tt(i=>')
assert 'coreServices:new pr(i.$baseRequest)' in registration
assert 'this.common=new dr' in blobs['PLUGIN'].decode()
imp=span('UTILITY_IMPORT_ALIASES','CORE','import{i as Cd,','from"./CeOxKRS_.js"',True)
for x in ['a as nr','l as ql','v as Vl','y as jl']:assert x in imp
hdr=span('COMMON_HEADERS_OD','CORE','od=t=>{','},VE=!0',True)
intr=span('REQUEST_INTERCEPTOR_R','CORE','const r=u=>{','},a=u=>')
route=span('API_PREFIX_C','CORE','c=u=>{var p,y,m;','},l=(u,d)=>')
constructor=span('BASE_REQUEST_CONSTRUCTOR','CORE','l=(u,d)=>{const f={...d};','class yk{')
ver=span('PUBLIC_BUILD_VERSION','CORE','ps="prod",Na="','kw="web-growth"',True)
device=span('ANONYMOUS_DEVICE_UUID','CORE','d=o.get("uuid")||nr();','const p=!/preheating=1/')
platform=span('PLATFORM_ENUM','CONSTANTS','Dt={DESKTOP:30,','},j=(')
site=span('MAIN_SITE_ZERO','CONSTANTS','St=(t="")=>{','m=0,d=')
lang=span('LANGUAGE_MAPPING','CONSTANTS','re={"zh-hk":','},ne="')
sign=span('PUBLIC_SIGN_CONTRACT','UTILITY','function Qh(e,t=!0){','var c2=')
sha_core=span('SHA256_HELPER_A2','UTILITY','Zh=[],Jh=[],r2=e=>','function Qh(e,t=!0){')
stable=span('STABLE_SORT_JSON','UTILITY','function y1(){','var $o={exports:{}}')
trace=span('TRACE_UUID_FORMAT','UTILITY','B2=()=>Xl().replace(/-/g,"").toLowerCase()','M2=e=>')
tz=span('TIMEZONE_HOURS','UTILITY','k2=()=>new Date().getTimezoneOffset()/60*-1','A2=(e,t=')
uuid=span('UUID_V4_GENERATOR','UTILITY','function Xl(e,t,n){','var _i={exports:{}}')
anti=span('ANTI_DEVICE_EMPTY_BRANCH','UTILITY','Xw=()=>{','},Bu={',True)
for x in ['u.headers.timestamp=new Date().getTime()','u.headers.traceId=nr()','u.headers.sign=f','const m=n.get(ke);m&&(u.headers.authorization=','requestPayload:u.method','u.params||{}:u.data||{}']:assert x in intr,x
for x in ['antiDeviceId:l','device_id:n.get("app_device_id")||e.uuid','timeZone:ql()']:assert x in hdr,x
assert 'const l=jl()||""' in hdr
assert 'withCredentials:!0' in constructor and 'headers:od(t)' in constructor
assert '/api'+'$'+'{u.url}' in route
assert '"5.3.37"' in ver and 'ANDROID_APP_H5:60' in platform and 'return o[t]?o[t]:0' in site
assert 'en:"en"' in lang and '"en-us":"en"' in lang
for x in ['return{encryptionContent:t,sign:Qh(t,!0)}','return t?n.toUpperCase():n','timestamp:t,traceId:n,deviceId:r,platformId:a,appVersion:s','let c="{}"']:assert x in sign,x
assert ''.join('$'+'{'+x+'}' for x in ['t','n','r','a','s','l||""','c']) in sign
assert 'Object.keys(o).sort' in stable and 'return""' in anti
assert 's2=Ql._createHelper(a2)' in sha_core and '_doProcessBlock' in sha_core
export=blobs['UTILITY'].decode().split('export{')[-1]
for x in ['B2 as a,','k2 as l,','l2 as v,','Xw as y,']:assert x in export
m=re.search(r'var xi=\{p1:"([^"]+)",p2:"([^"]+)",p3:"([^"]+)"\}',sign);assert m
prefix=''.join(m.groups());assert len(prefix)==32
V={'timestamp_ms':1792942912381,'traceId':'00000000000040008000000000000001','device_id':'00000000000040008000000000000002','platformId':30,'app_version':'5.3.37','antiDeviceId':'','GET_params':{}}
pre=prefix+str(V['timestamp_ms'])+V['traceId']+V['device_id']+str(V['platformId'])+V['app_version']+'{}'
digest=sha(pre.encode()).upper();assert len(digest)==64
ab=Path('/private/tmp/pump-bingx-crypto-metadata-actual.json').read_bytes()
assert sha(ab)=='27bffc63dd4d4afe0939017136ae832dbd55aef67f8da0bfa1cee622bc2a7a6d'
actual=json.loads(ab);mr=actual['body']['response'];assert mr['status']==200 and mr['data']['code']==100003
assert mr['received_ts']-mr['data']['timestamp']==180
plan=json.loads((B/'EXACT_WEB_METADATA_ONE_GET_PLAN_V1.json').read_text())
assert plan['request']['query']=={} and plan['request']['headers']=={'Accept':'application/json'}
url=plan['request']['url'];assert url=='https://api-app.acc-de.com/api/coin/v1/display-info/list'
common=['X-Requested-With','platformId','appSiteId','channel','reg_channel','app_version','device_id','lang','appId','mainAppId','timeZone','device_brand','antiDeviceId']
result={
 'schema':'PUMP_OFFLINE_PUBLIC_REQUEST_CLOCK_CONTRACT_V1','status':'STATIC_PUBLIC_CLIENT_CONTRACT_ESTABLISHED_SERVER_ACCEPTANCE_UNVERIFIED','authority':A,
 'endpoint':{'method':'GET','url':url,'query':{},'body':None},
 'call_chain':['requestCoinInfoList -> dr.request GET no params','pr.common=new dr(request); plugin coreServices:new pr($baseRequest)','baseRequest headers:od(t), interceptor r, route prefix /api','Core imports nr/ql/Vl/jl from CeOxKRS_, export aliases B2/k2/l2/Xw'],
 'clock_contract':{
  'timestamp':{'where':'header, not query','algorithm':'new Date().getTime()','unit':'Unix epoch milliseconds','timezone_adjustment':False,'server_offset_adjustment_found_in_this_path':False,'span':'REQUEST_INTERCEPTOR_R'},
  'timeZone':{'where':'common header','algorithm':'new Date().getTimezoneOffset()/60*-1','unit':'hours east of UTC, fractional allowed','IANA_name':False,'in_sign_preimage':False,'span':'TIMEZONE_HOURS','worker_example':'0 if actual client Date timezone is UTC. Never change clocks/timezone or substitute Moscow+3 for a UTC Worker.'}},
 'dynamic_headers':{
  'traceId':{'algorithm':'UUIDv4 -> strip hyphens -> lowercase,32hex','explicit_nonce_header_found':False,'server_nonce_semantics_proven':False,'spans':['TRACE_UUID_FORMAT','UUID_V4_GENERATOR']},
  'device_id':{'source':'app_device_id cookie if present, else appConfig.uuid from uuid cookie or fresh compactUUIDv4','anonymous_path_present':True,'read_real_cookie':False,'span':'ANONYMOUS_DEVICE_UUID'},
  'antiDeviceId':{'source':'jl() cached local fingerprint if present, else empty string','empty_branch_in_code':True,'server_accepts_empty_proven':False,'read_real_fingerprint':False,'span':'ANTI_DEVICE_EMPTY_BRANCH'},
  'sign':{'exact_header_name':'sign','algorithm':'uppercase hexadecimal SHA256 of UTF-8 preimage','HMAC':False,'public_build_prefix_parts':list(m.groups()),'public_build_prefix':prefix,'prefix_is':'Public build constant in retained frontend bytes; not account/API/session secret','order':['public_prefix','decimal timestamp','traceId','device_id','platformId','app_version','antiDeviceId or empty','normalized request payload'],'separators':'none','empty_GET_payload':'{}','general_GET_normalization':'o2 removes top-level null/undefined and normalizes array/Date/nonfinite/nested values; ep converts numbers to uppercase strings and booleans to strings; S1 stable-sorts JSON keys recursively. This request has no params and uses literal {}.','not_in_preimage':['URL/path','method itself','timeZone','appSiteId','authorization'],'method_role':'Only chooses GET payload normalization','missing_non_anti_fields':'JS template stringifies undefined, so do not silently replace missing required input with empty string','spans':['PUBLIC_SIGN_CONTRACT','SHA256_HELPER_A2','STABLE_SORT_JSON']}},
 'common_header_names':common,
 'pinned_public_defaults':{'app_version':'5.3.37','platformId_DESKTOP':30,'appSiteId_main_site':0,'appId':'30004','mainAppId':'10009','channel':'official','reg_channel':'official','lang_en_mapping':'en'},
 'auth_boundary':{'authorization':'Added Bearer only if token cookie exists. No token read/exported here.','withCredentials_in_constructor':True,'anonymous_construction_possible_in_code':True,'private_key_or_account_secret_in_sign':False,'server_anonymous_permission_proven':False,'server_fingerprint_requirement_known':False,'browser_sessions_copied':0},
 'actual_request_comparison':{'plan_header_names':['Accept'],'omitted_by_plan_common':common,'omitted_by_plan_dynamic':['timestamp','traceId','sign'],'plan_bypasses_interceptor':True,'outbound_wire_headers_present_in_supplied_response_wrapper':False,'wire_absence_independently_observed_by_SOURCE':False,'ROOT_reported_exact_plan_execution':True,'finding':'Exact reviewed bare request plan omits public client timestamp/sign/traceId and common signing inputs. This is an established construction mismatch; it does not prove the causal absent field for100003.','one_existing_input_for_wire_level_claim':'ROOT exact deployed34-module metadata-probe request/header construction or retained redacted outbound header-name capture; no new network necessary to establish omission.'},
 'actual_error_clock':{'http_status':200,'business_code':100003,'message':mr['data']['msg'],'server_error_ts':mr['data']['timestamp'],'broker_received_ts':mr['received_ts'],'difference_ms':180,'control_started_ts':actual['started_ts'],'control_received_ts':actual['received_ts'],'request_timestamp_echoed':False,'clock_skew_or_causal_fix_proven':False,'finding':'180ms numeric response timestamp gap is not clock-sync proof or request header value. Do not change Mac/Worker clocks.'},
 'minimal_candidate':{'status':'UNEXECUTED_PUBLIC_CLIENT_SHAPE_NOT_PROVEN_SERVER_MINIMUM','method':'GET','url':url,'query':{},'body':None,'headers':{'Accept':'application/json','X-Requested-With':'XMLHttpRequest','platformId':'30','appSiteId':'0','channel':'official','reg_channel':'official','app_version':'5.3.37','device_id':'<fresh anonymous compactUUIDv4, retained for this client>','lang':'en','appId':'30004','mainAppId':'10009','timeZone':'<truthful actual client offset hours>','device_brand':'','antiDeviceId':'','timestamp':'<fresh current Unix milliseconds at final send construction>','traceId':'<fresh compactUUIDv4>','sign':'<uppercase SHA256 exact preimage using identical timestamp/trace/device/platform/version/emptyanti/{}>'},'authorization':None,'cookies':None,'credentials_copied':False,'assumptions':['Pinned main-site desktop profile30/site0/version5.3.37','Empty antiDeviceId/device_brand branch exists in code but server permission unknown','Never update timestamp after hashing or reuse stale synthetic vector','No invented Origin/Referer/nonce/signature/query timestamp'],'max_attempts_if_ROOT_admits':1,'redirects':False,'host_fallback':False,'retry':False,'timeout_ms':10000,'max_response_bytes':2000000,'new_admission':False},
 'synthetic_translation_vector':{'input':V,'preimage':pre,'expected_SHA256_upper':digest,'public_JS_executed':False,'real_request_or_session':False,'purpose':'One manually translated standard SHA256 concatenation/units/order integrity case, not native signature acceptance or executed JS equivalence'},
 'previous_attempt':{'SPENT':True,'new_attempts_admitted':0,'old_unknowns_preserved':True,'caps_raised':False,'previous_frozen_package_changed':False},
 'remaining':'ROOT may review this exact pinned candidate and separately admit one precise action. Server-required minimum/anonymous access/signature acceptance and positive taxonomy/native bridge remain unproven.',
 'new_IO':{'GET':0,'search':0,'API':0,'WS':0,'SQL':0,'TG':0,'downloaded_JS_execution':0,'clock_or_timezone_changes':0,'old_audit_replays':0}}
save('CLOCK_CONTRACT_STATIC_SPANS_V1.json',{'schema':'PUMP_STATIC_CLOCK_SPANS_V1','offsets':'UTF8 bytes, zero-based/end-exclusive','inputs':{k:{'path':p,'sha256':h,'bytes':len(blobs[k])} for k,(p,h) in F.items()},'spans':spans,'JS_executed':False})
save('CLOCK_CONTRACT_RESULT_V1.json',result)
assert sha(frozen.read_bytes())==A['previous_frozen_package']['sha256']
save('CLOCK_CONTRACT_QUALIFICATION_V1.json',{'schema':'PUMP_CLOCK_STATIC_QUALIFICATION_V1','status':'PASS_STATIC_CONTRACT_ONLY','performed_ts':int(time.time()*1000),'authority':A,'one_affected_integrity_check':True,'checks':{'retained4files_exactSHA':True,'method_plugin_import_export_chain':True,'exact_UTF8_spans_and_hashes':True,'timestamp_ms_timezone_hours_traceUUID_signSHA256_order':True,'empty_GET_literal_braces':True,'one_synthetic_standard_hash_vector':True,'error180ms_gap':True,'bare_plan_missing_headers':True,'wire_absence_not_overclaimed':True,'frozen9b4fe68_unchanged':True,'downloadedJS_not_executed':True,'network_old_audits0':True},'nativePASS':False,'server_acceptance_verified':False,'new_IO':0})
print(json.dumps({'status':'PASS_STATIC_CONTRACT_ONLY','spans':len(spans),'timestamp':'header Unixms','timeZone':'header hours','sign':'public-prefix SHA256 uppercase','wire_omission_claim':'plan-level only','IO':0,'downloadedJS_execution':0}))

