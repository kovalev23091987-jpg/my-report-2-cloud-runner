import {INPUT_SCHEMA,createFact,emptyMap} from '../../contracts/index.mjs';
export const T=1800000000000,MINUTE=60000;
export const instrument={instrument_id:'ARTIFICIAL:BINGX:TEST-USDT',asset_id:'ARTIFICIAL:TEST',native_symbol:'TEST-USDT',base:'TEST',quote:'USDT',settle:'USDT',venue:'BINGX',market_type:'PERPETUAL',
  classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'ARTIFICIAL_FIXTURE_NOT_REAL_MARKET_PROOF',price_tick:0.01,quantity_step:0.000001,contract_multiplier:1};
export function fact(kind,value,unit,at=T){return createFact({fact_id:'ARTIFICIAL:'+kind+':'+at,instrument_id:instrument.instrument_id,kind,value,unit,event_ts:at,received_ts:at,
  expires_ts:at+(kind==='orderbook'?15000:kind==='price'?30000:90000),source:'ARTIFICIAL_FIXTURE',primary_provider:'ARTIFICIAL_FIXTURE',venue:'BINGX',status:'USABLE',origin:'OBSERVED',evidence_ref:'ARTIFICIAL_ONLY'});}
export function input(){
  const tail=[102,105,110,115,117,118,117.5,116,115,114,113.5,113,112,111,112],rows=[];let prev=100;
  for(let i=0;i<121;i++){
    const close=i<106?100+2*Math.sin(i*Math.PI/5):tail[i-106],open=prev;
    rows.push({open_ts:T-(121-i)*MINUTE,close_ts:T-(120-i)*MINUTE,closed:true,open,high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close,
      volume_base:i>=106&&i<=111?3000:i>111?300:1000,turnover_quote:null});prev=close;
  }
  return {schema_version:INPUT_SCHEMA,run_id:'ARTIFICIAL_PACKAGE_A',mode:'AUTO',analysis_ts:T,instrument:{...instrument},previous_wave:null,liquidations:emptyMap('ABSENT','ARTIFICIAL_NO_MAP'),
    facts:{price:fact('price',112,'USDT_PER_BASE'),candles:fact('candles',rows,'OHLC_USDT_VOLUME_BASE'),orderbook:fact('orderbook',{asks:[[112.1,1000],[112.2,1000]],bids:[[111.9,1000],[111.8,1000]]},'USDT_PRICE_BASE_QUANTITY')}};
}
export function zone(id,lower,upper,extra={}){return {zone_id:id,asset_id:instrument.asset_id,source:'ARTIFICIAL_MODEL',primary_provider:'ARTIFICIAL_MODEL',venue:'OTHER_VENUE',market_id:'TEST-PERP',
  lower,upper,event_ts:T,received_ts:T,expires_ts:T+120000,basis_type:'EXTERNAL_MODEL',model_id:'ARTIFICIAL_MODEL',model_version:'1',price_currency:'USDT',
  price_comparability:{evidence_ref:'ARTIFICIAL_PRICE_MAPPING'},magnitude_value:100000,magnitude_unit:'USDT',relative_scale:null,coverage:{scope:'ARTIFICIAL_ONLY'},limitations:[],
  position_ids:[],overlap_group:null,usable:true,evidence_ref:'ARTIFICIAL_ZONE_'+id,...extra};}
export function path({start=T,count=240,low=100,high=109}={}){return Array.from({length:count},(_,i)=>({open_ts:start+i*MINUTE,close_ts:start+(i+1)*MINUTE,closed:true,
  open:100,high,low,close:100,volume_base:1,turnover_quote:null}));}
export function signal(extra={}){return {signal_id:'ARTIFICIAL_SIGNAL_1',wave_id:'ARTIFICIAL_WAVE_1',t0:T,reference_price:100,rules_version:'ARTIFICIAL',mode:'AUTO',map_mode:'WITHOUT_MAP',plan:null,...extra};}
