import {detectClosed,TIMEFRAMES,hash} from './observer.mjs';
export const instrument={asset_id:'CONTROLLED:COIN',venue:'CONTROLLED_VENUE',upstream:'CONTROLLED_UPSTREAM',contract:'TEST-USDT',market:'FUTURES',quote:'USDT',price_unit:'USDT_PER_BASE',volume_unit:'BASE',multiplier:1,binding_ref:'controlled-native-binding',binding_kind:'VERIFIED_NATIVE',identity_verified:true};
export function fixture({timeframe='15m',offset=0,direction='RED',volume=1000,mode='REPLAY',asset='CONTROLLED:COIN'}={}){
 const d=TIMEFRAMES[timeframe],start=Math.ceil(1700000000000/d)*d+offset;
 const bars=Array.from({length:21},(_,n)=>({start_ts:start+n*d,end_ts:start+(n+1)*d,open:100,high:101,low:99,close:100,volume:100}));
 Object.assign(bars.at(-1),{high:105,low:95,close:direction==='RED'?99.9:100.1,volume});
 const source=bars.at(-1).end_ts;
 const args={instrument:{...instrument,asset_id:asset},timeframe,alignment_offset_ms:offset,bars,known_ts:source+1000,mode,provenance:{raw_sha256:hash(bars),raw_ref:'controlled:'+hash(bars),source_as_of_ts:source,received_ts:source+500,evidence_class:mode==='LIVE_CAPTURE'?'PROSPECTIVE':'CONTROLLED'}};
 return {...args,result:detectClosed(args)};
}
export function snapshot(card,{ts=card.first_known_ts+300000,price=100,id='S1',closed=false,timeframe=card.conditions.timeframe}={}){
 const d=TIMEFRAMES[timeframe]??300000,offset=card.alignment_offset_ms%d;
 const end=Math.floor((ts-offset)/d)*d+offset,start=end-d;
 const b={start_ts:start,end_ts:end,timeframe,open:100,high:Math.max(price,100)+1,low:Math.min(price,100)-1,close:price,volume:100};
 const raw=hash({id,price,ts});
 return {instrument:card.instrument,snapshot_id:id,source_ts:ts,received_ts:ts+100,price,raw_sha256:raw,...(closed?{closed_candle:{...b,raw_sha256:raw}}:{})};
}
