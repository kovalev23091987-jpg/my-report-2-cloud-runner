import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';
// Curated native network page definitions; eligibility still requires the
// frozen exact HTX native identity. Never resolve a ticker or arbitrary search.
export const WIKIMEDIA_NATIVE_PAGES=Object.freeze({
 cardano:Object.freeze({article:'Cardano_(blockchain_platform)',label:'Cardano'}),
 bitcoin:Object.freeze({article:'Bitcoin',label:'Bitcoin'}),
 ethereum:Object.freeze({article:'Ethereum',label:'Ethereum'}),
 solana:Object.freeze({article:'Solana_(blockchain_platform)',label:'Solana'}),
 dogecoin:Object.freeze({article:'Dogecoin',label:'Dogecoin'}),
 avalanche:Object.freeze({article:'Avalanche_(blockchain_platform)',label:'Avalanche'}),
 'bitcoin-cash':Object.freeze({article:'Bitcoin_Cash',label:'Bitcoin Cash'}),
 cosmos:Object.freeze({article:'Cosmos_(network)',label:'Cosmos'}),
 'ethereum-classic':Object.freeze({article:'Ethereum_Classic',label:'Ethereum Classic'}),
 litecoin:Object.freeze({article:'Litecoin',label:'Litecoin'}),
 near:Object.freeze({article:'NEAR_(blockchain_platform)',label:'NEAR'}),
 polkadot:Object.freeze({article:'Polkadot_(blockchain)',label:'Polkadot'}),
 stellar:Object.freeze({article:'Stellar_(payment_network)',label:'Stellar'}),
 tron:Object.freeze({article:'Tron_(blockchain)',label:'TRON'}),
 zcash:Object.freeze({article:'Zcash',label:'Zcash'}),
 xrp:Object.freeze({article:'XRP_Ledger',label:'XRP Ledger'}),
 hedera:Object.freeze({article:'Hedera_(distributed_ledger)',label:'Hedera'}),
});
function exactHederaNativeIdentity(identity,contract){
 return contract==='HBAR-USDT'&&identity?.chain==='hedera'&&identity?.asset_kind==='NATIVE'&&identity?.native_asset_id==='hedera:mainnet'&&identity?.contract_or_mint==null?{chain:'hedera'}:null;
}
export function exactWikimediaPageBinding({contract,asset_identity}={}){
 const native=exactNativeSectorBinding(asset_identity,contract)||exactHederaNativeIdentity(asset_identity,contract),page=native&&WIKIMEDIA_NATIVE_PAGES[native.chain];
 return page?{...page,chain:native.chain,asset_id:`${native.chain}:native:mainnet`,page_url:`https://en.wikipedia.org/wiki/${page.article}`}:null;
}
export function verifiedWikimediaEvidencePage(row){
 const chain=typeof row?.asset_id==='string'?row.asset_id.split(':')[0]:null;
 const page=exactWikimediaPageBinding({contract:row?.htx_contract,asset_identity:{chain,asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`,contract_or_mint:null}});
 return page&&row.asset_id===page.asset_id&&row.article===page.article&&row.page_url===page.page_url? page:null;
}
