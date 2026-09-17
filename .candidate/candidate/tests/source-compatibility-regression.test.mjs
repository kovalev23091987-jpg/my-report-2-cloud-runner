import assert from 'node:assert/strict';
import { collectPublicFullEvidence } from '../src/public-evidence-adapters.mjs';
import { normalizeEvidenceItem } from '../src/full-evidence-contract.mjs';

const H = 3600000;
const NOW = 1800000000000;
const jsonResponse = (data, status=200, ok=true) => ({ok,status,async json(){return data;}});

async function mockFetch(url){
  // Only Bybit identity is verified. OKX/Binance identity proof deliberately absent.
  if(url.includes('bybit.com/v5/market/instruments-info')) return jsonResponse({retCode:0,retMsg:'OK',result:{list:[{symbol:'ETHFIUSDT',baseCoin:'ETHFI',quoteCoin:'USDT',settleCoin:'USDT',contractType:'LinearPerpetual',status:'Trading',isPreListing:false,fundingInterval:'60'}]}});
  if(url.includes('okx.com/api/v5/public/instruments')) return jsonResponse({code:'50011',msg:'temporary unavailable',data:[]});
  if(url.includes('fapi.binance.com/fapi/v1/exchangeInfo')) return jsonResponse({code:-1003,msg:'rate limited'},429,false);
  if(url.includes('bybit.com/v5/market/funding/history')) return jsonResponse({retCode:0,result:{list:[{fundingRateTimestamp:String(NOW-H),fundingRate:'-0.001'},{fundingRateTimestamp:String(NOW-2*H),fundingRate:'-0.0011'}]}});
  if(url.includes('bybit.com/v5/market/open-interest')) return jsonResponse({retCode:0,result:{list:[{timestamp:String(NOW),openInterest:'121'},{timestamp:String(NOW-H),openInterest:'110'},{timestamp:String(NOW-2*H),openInterest:'100'}]}});
  if(url.includes('bybit.com/v5/market/kline')) return jsonResponse({retCode:0,result:{list:Array.from({length:26},(_,i)=>[String(NOW-(i+1)*H),String(100+i),String(101+i),String(99+i),String(100+i),'1'])}});
  // Non-verified venue collectors must fail closed rather than invent evidence.
  return jsonResponse({code:'50011',msg:'temporary unavailable',data:[]});
}

const out = await collectPublicFullEvidence({contract_code:'ETHFI-USDT',now_ts:NOW,fetch_impl:mockFetch});
assert.equal(out.alias_verification.asset_identity.verified,false);
const bybitFunding = out.evidence.find(x=>x.venue==='BYBIT' && x.metric==='funding_rate');
assert.ok(bybitFunding,'Bybit funding evidence must exist');
assert.equal(bybitFunding.venue_observation_status,'CLOSED','venue observation itself is factual/closed');
assert.equal(bybitFunding.status,'CLOSED','verified venue symbol must not be mislabeled SOURCE_INCOMPATIBLE');
assert.equal(bybitFunding.alias_verified,true);
assert.equal(bybitFunding.asset_identity_verified,false,'cross-venue asset identity is still not proven');
assert.equal(bybitFunding.eligible_for_chain_closure,false,'single-venue alias proof cannot close weighted chain');
const normalized = normalizeEvidenceItem({...bybitFunding,now_ts:NOW});
assert.equal(normalized.status,'SOURCE_INCOMPATIBLE','full-evidence contract must still fail closed until asset identity proof is corroborated');
assert.equal(normalized.eligible_for_chain_closure,false);

console.log(JSON.stringify({ok:true,suite:'source-compatibility-regression',assertions:'venue-closed != asset-identity-closed; no reversed alias block; chain closure remains fail-closed'},null,2));
