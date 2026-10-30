import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {normalizeHtxAssetReferences} from '../files/src/htx-asset-identity.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../'+p,import.meta.url))));
export const summary=JSON.parse(fs.readFileSync(new URL('../../checkpoints/n05-native-qualification-38052957545/native-summary.json',import.meta.url)));
export const end=summary.window_end_ts;
export const currencies=read('checkpoints/n05-native-qualification-38052957545/GATE-ALL-CURRENCY-IDENTITY.json.gz');
export const spot=read('checkpoints/n05-actual-qualification-38049404414/catalog-GATE-SPOT.json.gz');
export const candles=read('checkpoints/n05-native-qualification-38052957545/GATE-PEOPLE-CANDLES.json.gz');
const rawPeople=read('checkpoints/n05-native-qualification-38052957545/GATE-PEOPLE-PAGE-1.json.gz');
const htx=normalizeHtxAssetReferences(read('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz'));
export const identity=htx.entries.PEOPLE.identities.find(r=>r.chain==='ethereum');
export const method='HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS';
export function actual(base='PEOPLE'){
 const name=`GATE-${base}-PAGE-1.json.gz`,page=base==='PEOPLE'?structuredClone(rawPeople):read('checkpoints/n05-native-qualification-38052957545/'+name),r=summary.sources.find(r=>r.file===name);
 return{contract:base+'-USDT',identity:structuredClone(htx.entries[base].identities.find(r=>r.chain==='ethereum')),identity_method:method,currencies,spot,pages:[page],original_candles:base==='PEOPLE'?candles:read('checkpoints/n05-native-qualification-38052957545/GATE-SUSHI-CANDLES.json.gz'),trade_receipts:[{url:r.url,http_status:r.http_status,received_ts:r.received_ts,body_sha256:r.body_sha256,payload_sha256:sha(JSON.stringify(page))}],window_end_ts:end,observed_ts:r.received_ts};
}
// Explicit control: move one original event clock; receipt/body hashes below
// identify the controlled serialization. No original/provider-positive claim.
export function controlled({fast=false}={}){
 const p=actual();p.pages[0][0].create_time_ms=String(end-1000)+'.000000';p.pages[0][0].create_time=String(end/1000-1);
 p.observed_ts=fast?end+10000:p.observed_ts;
 p.trade_receipts[0]={...p.trade_receipts[0],received_ts:p.observed_ts,body_sha256:sha(JSON.stringify(p.pages[0])),payload_sha256:sha(JSON.stringify(p.pages[0]))};return p;
}
// Full-N05 control recomputes volumes from every retained parsed trade. All
// such candle quantities are controlled, never a second provider original.
export function reconciledCandles(p){
 const rows=structuredClone(candles),byTime=new Map(rows.map(r=>[Number(r[0])*1000,r]));
 for(const r of rows){r[1]='0.00000000';r[6]='0.00000000';}
 const totals=new Map();for(const t of p.pages.flat()){const m=Math.floor(Number(t.create_time_ms.split('.')[0])/60000)*60000,x=totals.get(m)||{base:0,quote:0};x.base+=Number(t.amount);x.quote+=Number(t.amount)*Number(t.price);totals.set(m,x);}
 for(const [ts,t]of totals){const r=byTime.get(ts);r[1]=t.quote.toFixed(8);r[6]=t.base.toFixed(8);}return rows;
}
