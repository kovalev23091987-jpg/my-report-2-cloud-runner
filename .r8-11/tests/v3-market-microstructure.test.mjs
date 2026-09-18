import test from 'node:test';import assert from 'node:assert/strict';
import {buildVenueIdentity} from '../src/v3-liquidation-data-plane.mjs';
import {buildMicrostructureSubscribeFrames,parseBybitPublicTrade,parseBybitTicker,applyBybitOrderbook,parseGatePublicTrades,parseGateBookTicker,applyGateOrderbookUpdate,parseGateContractStats,aggregateMicrostructureMinute} from '../src/v3-market-microstructure.mjs';
const by=buildVenueIdentity({htx_contract:'BTC-USDT',venue:'BYBIT',venue_symbol:'BTCUSDT',verified:true});
const gate=buildVenueIdentity({htx_contract:'BTC-USDT',venue:'GATE',venue_symbol:'BTC_USDT',verified:true,multiplier:.0001});

test('Bybit microstructure subscriptions and normalization are factual and bounded',()=>{
 const f=buildMicrostructureSubscribeFrames({venue:'BYBIT',identity_by_contract:{'BTC-USDT':by}});assert.equal(f.status,'CLOSED');assert.ok(f.data[0].args.includes('publicTrade.BTCUSDT'));assert.ok(f.data[0].args.includes('tickers.BTCUSDT'));assert.ok(f.data[0].args.includes('orderbook.50.BTCUSDT'));
 const tr=parseBybitPublicTrade({topic:'publicTrade.BTCUSDT',type:'snapshot',data:[{T:1000,s:'BTCUSDT',S:'Buy',v:'2',p:'50000',i:'t1',seq:7}]},{identity:by,received_ts:1100});assert.equal(tr.data[0].notional_usdt,100000);assert.equal(tr.data[0].taker_side,'BUY');
 const tk=parseBybitTicker({topic:'tickers.BTCUSDT',type:'snapshot',ts:1000,data:{symbol:'BTCUSDT',lastPrice:'50000',markPrice:'50001',indexPrice:'49999',openInterest:'10',openInterestValue:'500000',turnover24h:'1000000',fundingRate:'-0.001',fundingIntervalHour:'8',bid1Price:'49999',bid1Size:'1',ask1Price:'50001',ask1Size:'2'}},{identity:by,received_ts:1100});assert.equal(tk.status,'CLOSED');assert.equal(tk.data.funding_interval_hours,8);assert.equal(tk.data.top1_ask_usdt,100002);
 const snap=applyBybitOrderbook(null,{topic:'orderbook.50.BTCUSDT',type:'snapshot',ts:1000,data:{s:'BTCUSDT',u:1,seq:1,b:[['49999','2'],['49998','1']],a:[['50001','3'],['50002','1']]}},{identity:by,received_ts:1100});assert.equal(snap.status,'CLOSED');assert.ok(snap.data.summary.top20_bid_usdt>0);
});

test('Gate keeps notional UNKNOWN without proven multiplier and detects orderbook gaps',()=>{
 const noMult={...gate,multiplier:null};
 const tr=parseGatePublicTrades({channel:'futures.trades',event:'update',time_ms:1000,result:[{contract:'BTC_USDT',size:'-10',price:'50000',id:1,create_time_ms:900}]},{identity:noMult,received_ts:1100});assert.equal(tr.data[0].notional_usdt,null);assert.equal(tr.data[0].notional_status,'UNKNOWN_MULTIPLIER');
 const bbo=parseGateBookTicker({channel:'futures.book_ticker',event:'update',result:{s:'BTC_USDT',t:1000,b:'49999',B:'10',a:'50001',A:'20'}},{identity:gate,multiplier:.0001});assert.equal(bbo.status,'CLOSED');assert.ok(bbo.data.top1_bid_usdt>0);
 let book=applyGateOrderbookUpdate(null,{channel:'futures.order_book_update',event:'update',result:{s:'BTC_USDT',t:1000,U:1,u:2,full:true,b:[{p:'49999',s:'10'}],a:[{p:'50001',s:'10'}]}},{identity:gate,multiplier:.0001});assert.equal(book.status,'CLOSED');
 book=applyGateOrderbookUpdate(book.data.state,{channel:'futures.order_book_update',event:'update',result:{s:'BTC_USDT',t:1100,U:5,u:6,b:[{p:'49998',s:'5'}],a:[]}},{identity:gate,multiplier:.0001});assert.equal(book.status,'PARTIAL');assert.equal(book.data.summary.gap_detected,true);
 const st=parseGateContractStats({channel:'futures.contract_stats',event:'update',time_ms:1000,result:[{contract:'BTC_USDT',time:1,mark_price:'50000',open_interest:'100',open_interest_usd:'500000',top_lsr_account:'1.2',top_lsr_size:'1.1'}]},{identity:gate,received_ts:1100});assert.equal(st.data.top_account_ratio,1.2);
});

test('compact minute aggregate never invents missing data',()=>{
 const out=aggregateMicrostructureMinute({contract:'BTC-USDT',venue:'GATE',bucket_ts:60000,trades:[{contract:'BTC-USDT',venue:'GATE',taker_side:'BUY',notional_usdt:null}],stats:{coverage_status:'CLOSED_PUBLIC_CONTRACT_STATS',oi:100}});
 assert.equal(out.status,'CLOSED');assert.equal(out.data.taker_buy_usdt,null);assert.equal(out.data.delta_usdt,null);assert.equal(out.data.trade_notional_coverage_closed,false);assert.equal(out.data.index,null);assert.equal(out.data.probability,null);
});
