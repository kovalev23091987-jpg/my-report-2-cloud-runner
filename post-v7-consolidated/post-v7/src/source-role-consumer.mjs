import {SOURCES,sourceForRole} from './source-role-registry.mjs';
export const SOURCE_ROLE_CONSUMER_VERSION='post-v7-source-role-consumer-v1-20260926';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const aliases=Object.freeze({
 HTX:'HTX_OFFICIAL',HUOBI:'HTX_OFFICIAL',HTX_OFFICIAL:'HTX_OFFICIAL',
 BINANCE:'BINANCE_OFFICIAL',BINANCE_OFFICIAL:'BINANCE_OFFICIAL',
 BYBIT:'BYBIT_OFFICIAL',BYBIT_OFFICIAL:'BYBIT_OFFICIAL',
 GATE:'GATE_OFFICIAL','GATE.IO':'GATE_OFFICIAL',GATE_OFFICIAL:'GATE_OFFICIAL',
 BYKARANTELI:'BYKARANTELI','BYKARANTELI LIQMAP PUBLIC API':'BYKARANTELI',
 COINLOBSTER:'COINLOBSTER',COINFUTY:'COINFUTY','TRADER.PRO':'TRADER_PRO',TRADER_PRO:'TRADER_PRO',
 'DEPTH RADAR':'DEPTH_RADAR',DEPTH_RADAR:'DEPTH_RADAR',VYX:'VYX',NANSEN:'NANSEN',
 COINGECKO:'COINGECKO','COIN GECKO':'COINGECKO',COINMARKETCAP:'COINMARKETCAP',CMC:'COINMARKETCAP','TOKEN TERMINAL':'TOKEN_TERMINAL',TOKEN_TERMINAL:'TOKEN_TERMINAL'
});
export function sourceKey(receipt={}){const raw=upper(receipt.source_key||receipt.source||receipt.venue||receipt.provider);if(!raw)return null;if(aliases[raw])return aliases[raw];for(const [a,k] of Object.entries(aliases))if(raw.includes(a))return k;return null;}
export function classifyReceipt(receipt={}){const key=sourceKey(receipt),spec=key?SOURCES[key]:null;return {...receipt,source_key:key,source_family:spec?.family??null,source_kind:spec?.kind??null,source_priority:spec?.priority??0,assigned_roles:spec?.roles??[],independence_group:spec?.family??null,registry_known:Boolean(spec)};}
export function buildRoleEvidenceView(receipts=[]){const classified=(Array.isArray(receipts)?receipts:[]).map(classifyReceipt);const roles={};for(const [name,spec] of Object.entries(SOURCES))for(const role of spec.roles){const matches=classified.filter(x=>x.source_key===name&&x.assigned_roles.includes(role));if(matches.length)(roles[role]??=[]).push(...matches);}for(const role of Object.keys(roles))roles[role].sort((a,b)=>(b.source_priority??0)-(a.source_priority??0));const independent={};for(const [role,items] of Object.entries(roles))independent[role]=[...new Set(items.map(x=>x.independence_group).filter(Boolean))];return {version:SOURCE_ROLE_CONSUMER_VERSION,status:'CLOSED',classified,roles,independent_groups:independent,unknown_sources:classified.filter(x=>!x.registry_known)};}
export function primaryReceiptForRole(receipts,role){const v=buildRoleEvidenceView(receipts);return v.roles?.[role]?.[0]??null;}
export function independentConfirmationCount(receipts,role){return buildRoleEvidenceView(receipts).independent_groups?.[role]?.length??0;}
export default{SOURCE_ROLE_CONSUMER_VERSION,sourceKey,classifyReceipt,buildRoleEvidenceView,primaryReceiptForRole,independentConfirmationCount};
