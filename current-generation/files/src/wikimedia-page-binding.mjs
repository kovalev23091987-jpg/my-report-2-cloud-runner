import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
// Curated native network page definitions; eligibility still requires the
// frozen exact HTX native identity. Never resolve a ticker or arbitrary search.
export const WIKIMEDIA_NATIVE_PAGES=Object.freeze({
 cardano:Object.freeze({article:'Cardano_(blockchain_platform)',label:'Cardano'}),
 bitcoin:Object.freeze({article:'Bitcoin',label:'Bitcoin'}),
 ethereum:Object.freeze({article:'Ethereum',label:'Ethereum'}),
 solana:Object.freeze({article:'Solana_(blockchain_platform)',label:'Solana'}),
 dogecoin:Object.freeze({article:'Dogecoin',label:'Dogecoin'}),
});
export function exactWikimediaPageBinding({contract,asset_identity}={}){
 const native=exactNativeSectorBinding(asset_identity,contract),page=native&&WIKIMEDIA_NATIVE_PAGES[native.chain];
 return page?{...page,chain:native.chain,asset_id:`${native.chain}:native:mainnet`,page_url:`https://en.wikipedia.org/wiki/${page.article}`}:null;
}
export function verifiedWikimediaEvidencePage(row){
 const chain=typeof row?.asset_id==='string'?row.asset_id.split(':')[0]:null;
 const page=exactWikimediaPageBinding({contract:row?.htx_contract,asset_identity:{chain,asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`,contract_or_mint:null}});
 return page&&row.asset_id===page.asset_id&&row.article===page.article&&row.page_url===page.page_url? page:null;
}
