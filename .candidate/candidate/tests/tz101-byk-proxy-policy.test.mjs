import assert from 'node:assert/strict';
import { validateByKaranteliProxyTarget } from '../src/tz101-byk-proxy-policy.mjs';
const yes=[
 'https://bykaranteli.com/api/liqmap/public?symbol=BTC',
 'https://bykaranteli.com/api/public/liquidations?symbol=BTCUSDT',
 'https://bykaranteli.com/api/public/coverage',
 'https://bykaranteli.com/api/public/symbols?top=1000',
 'https://bykaranteli.com/api/public/smart-money/BTCUSDT',
 'https://bykaranteli.com/api/series?metric=whale_net&symbol=BTCUSDT&period=1h&limit=48',
];
for(const u of yes) assert.equal(validateByKaranteliProxyTarget(u).allowed,true,u);
const no=[
 'http://bykaranteli.com/api/public/smart-money/BTCUSDT',
 'https://evil.com/api/public/smart-money/BTCUSDT',
 'https://bykaranteli.com/api/public/smart-money/牛来USDT',
 'https://bykaranteli.com/api/public/smart-money/BTCUSDT?x=1',
 'https://bykaranteli.com/api/series?metric=funding&symbol=BTCUSDT&period=1h&limit=48',
 'https://bykaranteli.com/api/series?metric=whale_net&symbol=BTCUSDT&period=4h&limit=48',
 'https://bykaranteli.com/api/series?metric=whale_net&symbol=BTCUSDT&period=1h&limit=999',
 'https://bykaranteli.com/api/series?metric=whale_net&symbol=BTCUSDT&period=1h&limit=48&url=https://evil.com',
 'https://bykaranteli.com/api/public/symbols?top=1001',
 'https://bykaranteli.com/api/public/coverage?x=1',
 'https://bykaranteli.com/api/public/fees',
];
for(const u of no) assert.equal(validateByKaranteliProxyTarget(u).allowed,false,u);
console.log(JSON.stringify({ok:true,suite:'tz101-byk-proxy-policy',allowed:yes.length,denied:no.length}));
