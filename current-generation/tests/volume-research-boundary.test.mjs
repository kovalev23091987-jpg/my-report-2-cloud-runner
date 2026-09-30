import test from 'node:test';import assert from 'node:assert/strict';
import {validateResearchCandles} from '../../audit-fixes/source-optimization-20260930/volume-feasibility.mjs';
test('HTTP 200 candles for a different requested session cannot validate a volume research dataset',()=>{
 const args={contract:'SOL-USDT',start:120,end:239},rows=[120,180].map(id=>({id,open:10,high:11,low:9,close:10,amount:2,vol:2,trade_turnover:20})),p={status:'ok',ch:'market.SOL-USDT.kline.1min',data:rows};
 assert.equal(validateResearchCandles(p,args).status,'COMPLETE_MINUTE_CANDLES_NOT_TRADE_PROFILE');
 for(const data of [rows.map(r=>({...r,id:r.id+86400})),[rows[0],rows[0]],[rows[0]],rows.map(r=>({...r,amount:null}))])assert.equal(validateResearchCandles({...p,data},args).status,'REQUESTED_DAY_OR_SCHEMA_NOT_CLOSED');
 assert.equal(validateResearchCandles({...p,ch:'market.LINK-USDT.kline.1min'},args).status,'REQUESTED_DAY_OR_SCHEMA_NOT_CLOSED');
});
