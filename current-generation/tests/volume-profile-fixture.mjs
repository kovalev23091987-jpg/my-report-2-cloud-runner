import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {parseHtxTradePayload} from '../files/src/htx-trade-json.mjs';
export function wireFixture(){const f=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('./fixtures/volume-profile-wire.json.gz.base64',import.meta.url),'utf8'),'base64')));for(const n of ['1','2','10'])if(createHash('sha256').update(f[n]).digest('hex')!==f.provenance.raw_sha256[n])throw Error('WIRE_FIXTURE_HASH');return f;}
export function realInput(){const f=wireFixture();return {contract:'QNT-USDT',now:f.provenance.now,info:JSON.parse(f['1']),candles:JSON.parse(f['2']),trades:parseHtxTradePayload(f['10'])};}
