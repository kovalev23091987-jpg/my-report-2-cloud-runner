const ordinary=new Set(['HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK','HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS','VERSIONED_EXPLORER_EXACT_TOKEN_BINDING']);
const manual='MANUAL_EXACT_REGISTRY',paprika='COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS';
const validCoinId=value=>/^[a-z0-9][a-z0-9-]{2,79}$/.test(value||'');
const referenceHashes=receipts=>new Set((Array.isArray(receipts)?receipts:[]).filter(h=>/^[a-f0-9]{64}$/.test(h)));
const chains=new Set(['ethereum','bsc','arbitrum','base','polygon','optimism','avalanche','solana']);
const same=(a,b)=>a?.chain===b?.chain&&(a?.asset_kind==='NATIVE'||b?.asset_kind==='NATIVE'
 ?a?.asset_kind===b?.asset_kind&&a?.native_asset_id===b?.native_asset_id&&a?.contract_or_mint===null&&b?.contract_or_mint===null
 :a?.chain==='solana'?a?.contract_or_mint===b?.contract_or_mint:String(a?.contract_or_mint||'').toLowerCase()===String(b?.contract_or_mint||'').toLowerCase());
const validExtra=id=>id?.asset_kind==='NATIVE'?id.contract_or_mint===null&&id.native_asset_id===id.chain+':mainnet'
 :chains.has(id?.chain)&&(id.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id.contract_or_mint||''):/^0x[0-9a-f]{40}$/i.test(id.contract_or_mint||''));

// A new producer method requires its closed original context. Preserve the
// method; never rename an owner registry or aggregator as an HTX primary.
export function verifiedAssetRouteIdentity(params={}){
 const {contract,asset_identity:id,identity_method:method,supplemental_context:context,asset_binding_proof:retained}=params;
 if(!/^\S+-USDT$/u.test(String(contract||''))||!id?.chain)return null;
 if(!ordinary.has(method)&&![manual,paprika].includes(method))return null;
 const native=id.asset_kind==='NATIVE';
 if(native?(id.contract_or_mint!=null||id.native_asset_id!==id.chain+':mainnet'):!id.contract_or_mint)return null;
 let proof;
 if(!ordinary.has(method)){
  if(!validExtra(id))return null;
  const kind=method===manual?'CLOSED_OWNER_REGISTRY':'CLOSED_COINPAPRIKA_HTX_REFERENCE';
  const provenance=method===manual?retained?.registry_status==='CLOSED'&&retained?.identity_status==='CLOSED':validCoinId(retained?.coinpaprika_id)&&referenceHashes(retained?.reference_body_sha256).size>=2;
  if(provenance&&retained?.schema==='VERIFIED_ASSET_ROUTE_BINDING_V1'&&retained.kind===kind&&retained.contract===contract&&retained.identity_method===method&&retained.static_binding_only===true&&retained.decision_effect===false&&same(retained.identity,id))proof=retained;
  else{
   if(context?.contract!==contract||context.base!==contract.slice(0,-5)||context.identity_status!=='CLOSED'||context.identity_method!==method||context.registry_confirmation_required===true||!same(context.asset_identity,id))return null;
   if(method===manual&&context.registry_status!=='CLOSED')return null;
   const reference=context.asset_reference;
   if(method===paprika&&(!validCoinId(reference?.coinpaprika_id)||referenceHashes(reference?.receipts?.map(r=>r.body_sha256)).size<2))return null;
   if(method===paprika&&(reference?.status!=='CLOSED'||reference.contract!==contract||reference.identity_method!==method||reference.reference_kind!=='STATIC_ASSET_BINDING_ONLY'||!same(reference.identity,id)||!Array.isArray(reference.receipts)||!reference.receipts.some(r=>/^https:\/\/api\.coinpaprika\.com\/v1\/exchanges\//.test(r.url||'')&&/^[a-f0-9]{64}$/.test(r.body_sha256||''))||!reference.receipts.some(r=>/^https:\/\/api\.coinpaprika\.com\/v1\/coins\//.test(r.url||'')&&/^[a-f0-9]{64}$/.test(r.body_sha256||''))))return null;
   proof={schema:'VERIFIED_ASSET_ROUTE_BINDING_V1',kind,contract,identity_method:method,identity:{...id},static_binding_only:true,decision_effect:false,
    ...(method===paprika?{coinpaprika_id:reference.coinpaprika_id,reference_body_sha256:reference.receipts.map(r=>r.body_sha256).filter(Boolean)}:{registry_status:'CLOSED',identity_status:'CLOSED'})};
  }
 }
 return{contract,chain:id.chain,asset_kind:native?'NATIVE':'TOKEN',...(native?{native_asset_id:id.native_asset_id}:{contract_or_mint:id.contract_or_mint}),identity_method:method,...(proof?{asset_binding_proof:proof}:{})};
}
export function withVerifiedAssetRouteIdentity(params={}){
 const verified=verifiedAssetRouteIdentity(params);
 return verified?.asset_binding_proof?{...params,asset_binding_proof:verified.asset_binding_proof}:params;
}
