import {ORDERLY_VERIFIED_HTX_MARKETS} from './orderly-public-liquidation-positions.mjs';

export const LIQ_SHARED_HTTP_CAP=8;
export const LIQ_NATIVE_HTTP_ALLOCATION=4;
export const LIQ_SUPPLEMENT_PER_CANDIDATE_CAP=2;

// Capability hints from the saved 2026-10-12 CoinBoss probe and 2026-10-13
// Swolecharts catalog/payloads. Only a current exact numeric reply admits a level.
export const COINBOSS_RECENT_NUMERIC=new Set('AAVE ACE ADA AKE ALGO APT ARB ASTER ATOM AVAX BCH BNB BOME BR CHZ DOGE DOT ENA ETC ETHFI EUL FARTCOIN FIL HBAR HYPE ICP JUP LINK LIT LTC MARSCOIN NEAR OKB ONDO OP PAXG PENGU PONS PUMP RIVER RLC SOL SUI TAO TIA TRUMP TRX UNI USELESS WLD XAUT XLM XMR XPL XRP ZEC'.split(' '));
export const SWOLE_CATALOG_ROUTE=new Set('AAVE ADA APT ARB ASTER AVAX BCH BNB BTW DOGE DOT ENA FARTCOIN FIL GRAM HBAR HYPE LINK LIT LTC NEAR ONDO PAXG PEPE PUMP QNT SOL STRK SUI TAO TRUMP TRX UNI WLD XAUT XLM XMR XPL XRP ZEC'.split(' '));
export const SWOLE_EXACT_NUMERIC=new Set(['FIL','STRK']);
// The saved Orderly public-position snapshot contained numeric position levels
// for every one of these 38 exact markets. Give an observed-position source
// the first remaining request before aggregate market models.
export const ORDERLY_SAVED_NUMERIC=ORDERLY_VERIFIED_HTX_MARKETS;
const asset=contract=>String(contract||'').match(/^([A-Z0-9]+)-USDT$/)?.[1]??null;
export function liquidationModelOrder(contract){
 const base=asset(contract);if(!base||['BTC','ETH'].includes(base))return[];
 if(SWOLE_EXACT_NUMERIC.has(base))return['SWOLE','COINBOSS'];
 if(COINBOSS_RECENT_NUMERIC.has(base))return SWOLE_CATALOG_ROUTE.has(base)?['COINBOSS','SWOLE']:['COINBOSS'];
 if(SWOLE_CATALOG_ROUTE.has(base))return['SWOLE','COINBOSS'];
 return['COINBOSS']; // Earlier negative probes do not become a permanent blacklist.
}

export function liquidationSourceOrder(contract){
 const base=asset(contract),models=liquidationModelOrder(contract);
 if(!base||['BTC','ETH'].includes(base))return[];
 return ORDERLY_SAVED_NUMERIC.has(base)?['ORDERLY',...models]:[...models,'ORDERLY'];
}

const count=value=>Number.isSafeInteger(value)&&value>=0?value:LIQ_SHARED_HTTP_CAP;
export function liquidationSupplementAllowance({source,native_http=0,orderly_http=0,coinboss_http=0,swole_http=0,candidate_http=0,supplement_http_for_candidate=0}={}){
 const remaining=Math.max(0,LIQ_SHARED_HTTP_CAP-count(native_http)-count(orderly_http)-count(coinboss_http)-count(swole_http));
 const candidateRemaining=Math.max(0,LIQ_SHARED_HTTP_CAP-count(candidate_http));
 const supplementRemaining=Math.max(0,LIQ_SUPPLEMENT_PER_CANDIDATE_CAP-count(supplement_http_for_candidate));
 return ['COINBOSS','SWOLE','ORDERLY'].includes(source)?Math.min(1,remaining,candidateRemaining,supplementRemaining):0;
}
