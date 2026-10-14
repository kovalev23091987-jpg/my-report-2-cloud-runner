import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {normalizeHtxAssetReferences,collectHtxBoundSupplementalContext,HTX_ASSET_IDENTITY_VERSION}=await import(modulePath('htx-asset-identity.mjs'));
const {parseSupplementalIdentityRegistry,sameChainAssetIdentity}=await import(modulePath('supplemental-candidate-context.mjs'));
const {planCandidateEvidenceRoutes,unavailableExternalN05Route,sourceWasActuallyChecked}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const {verifiedAssetRouteIdentity}=await import(modulePath('verified-asset-route-identity.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
const raw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const original=JSON.parse(raw),payload=original.payload||original;
const approved=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz',import.meta.url)))).assets;
const normalized=normalizeHtxAssetReferences(payload),affected=['ALGO','CHZ','DASH','FIL','ICP','STEEM','TAO','TIA','XMR','XPL'];
test('all original approved native HTX bindings survive supplemental parsing and preserve the authoritative route origin',()=>{
 let tested=0;
 for(const a of approved){const r=normalized.entries[a.symbol];if(r?.status!=='CLOSED'||r.identities[0]?.asset_kind!=='NATIVE')continue;
  const id=r.identities[0],accepted=parseSupplementalIdentityRegistry({[a.symbol]:id}).entries[a.symbol]?.identity;
  assert.deepEqual(accepted,id,a.symbol);assert.equal(sameChainAssetIdentity(id,accepted),true);tested++;
  const p={contract:a.asset_analysis_contract,asset_identity:accepted,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',source_health_admit:()=>({allowed:true})};
  assert.equal(verifiedAssetRouteIdentity(p)?.native_asset_id,id.native_asset_id);
  assert.ok(planCandidateEvidenceRoutes(p).routes.some(x=>x.name==='JOINT_FLOW'),a.symbol);
 }
 assert.equal(tested,30);for(const symbol of affected)assert.equal(normalized.entries[symbol].status,'CLOSED');
});
class D1{constructor(){this.raw=new DatabaseSync(':memory:');}prepare(sql){const db=this;return{bind(...p){this.p=p;return this;},async run(){return{meta:{changes:db.raw.prepare(sql).run(...(this.p||[])).changes}};},async first(){return db.raw.prepare(sql).get(...(this.p||[]))||null;}};}async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}}
test('cached original FIL reference reaches the production supplemental seam without provider requests or a guessed wrapped identity',async()=>{
 const d=new D1(),now=1791800000000;await installEvidenceSourceStore(d);
 await writeEvidenceSourceCache(d,{source:'HTX_ASSET_REFERENCE',asset_key:'ALL_CURRENCIES_CHAIN_ADDRESSES_V1',observed_ts:now,expires_ts:now+1000,payload:{version:HTX_ASSET_IDENTITY_VERSION,...normalized,observed_ts:now,receipt:{parsed_payload_sha256:crypto.createHash('sha256').update(raw).digest('hex')}}});
 let calls=0;
 try{const context=await collectHtxBoundSupplementalContext({db:d,contract:'FIL-USDT',registry:{},run_id:'OLD_ORIGINAL_FIL_HANDOFF',now,fetch_impl:async()=>{calls++;throw Error('NO_PROVIDER_CALL');},supplemental_collect:async p=>({contract:'FIL-USDT',base:'FIL',identity_status:'CLOSED',registry_status:'CLOSED',identity_method:'MANUAL_EXACT_REGISTRY',asset_identity:parseSupplementalIdentityRegistry(p.registry).entries.FIL?.identity,network_calls:0})});
  assert.equal(calls,0);assert.equal(context.identity_reference_network_calls,0);assert.equal(context.identity_method,'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK');
  assert.deepEqual(context.asset_identity,{chain:'filecoin',asset_kind:'NATIVE',native_asset_id:'filecoin:mainnet',contract_or_mint:null});
  assert.ok(planCandidateEvidenceRoutes({contract:'FIL-USDT',...context,source_health_admit:()=>({allowed:true})}).routes.some(x=>x.name==='JOINT_FLOW'));
 }finally{d.raw.close();}
});
test('unknown networks, mismatched native IDs and token addresses cannot acquire a native binding',()=>{
 for(const row of [{chain:'unknown',asset_kind:'NATIVE',native_asset_id:'unknown:mainnet',contract_or_mint:null},{chain:'filecoin',asset_kind:'NATIVE',native_asset_id:'monero:mainnet',contract_or_mint:null},{chain:'filecoin',asset_kind:'NATIVE',native_asset_id:'filecoin:mainnet',contract_or_mint:'f0123'}])assert.equal(parseSupplementalIdentityRegistry({FIL:row}).entries.FIL.identity,null);
 assert.equal(sameChainAssetIdentity(normalized.entries.FIL.identities[0],{chain:'ethereum',contract_or_mint:'0x9afb950948c2370975fb91a441f36fdc02737cd4'}),false);
});
test('an unplanned external route never impersonates exhausted request allowance and real refusal is preserved',()=>{
 const p={contract:'FIL-USDT',asset_identity:normalized.entries.FIL.identities[0],identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK'};
 assert.equal(unavailableExternalN05Route({contract:'FIL-USDT'}).status,'EXACT_ASSET_IDENTITY_REQUIRED');
 assert.equal(unavailableExternalN05Route(p).status,'SOURCE_HEALTH_ADMISSION_REQUIRED');
 assert.equal(unavailableExternalN05Route({...p,source_health_admit:()=>({allowed:true})}).status,'SOURCE_COLLECTOR_NOT_DISPATCHED');
 const denied={status:'DEFERRED_SHARED_REQUEST_ENVELOPE',network_calls:0,evidence:[]};assert.equal(unavailableExternalN05Route(p,denied),denied);
 for(const r of [unavailableExternalN05Route({}),unavailableExternalN05Route(p),unavailableExternalN05Route({...p,source_health_admit:()=>({allowed:true})})])assert.equal(sourceWasActuallyChecked(r),false);
});
