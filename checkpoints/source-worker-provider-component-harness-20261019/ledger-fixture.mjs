import {createHash} from 'node:crypto';
const NOW=1792407299550;
const CGURL='https://api.coingecko.com/api/v3/coins/categories/list';
const hash=s=>createHash('sha256').update(s).digest('hex');

function dbFixture({source='COINGECKO_SECTOR',day=17,rollingBefore=2,rollingAfter=3,dailyAllowed=true,minuteAllowed=true,unknown=0,cache=false}={}){
 const trace=[];let sums=0;
 const db={usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{sql,params:[],bind(...args){this.params=args;return this;},async run(){trace.push({op:'run',sql,params:this.params});return{success:true};},async first(){
  trace.push({op:'first',sql,params:this.params});
  if(sql.includes('SELECT attempts FROM report2_evidence_source_daily'))return day===null?null:{attempts:day};
  if(sql.includes('SELECT source,attempts FROM report2_evidence_source_reservation'))return dailyAllowed?{source,attempts:1}:null;
  if(sql.includes('SELECT units FROM report2_provider_minute_ledger_v1'))return minuteAllowed?{units:1}:null;
  if(sql.includes('SELECT COALESCE(SUM(units),0) AS units'))return{units:sums++===0?rollingBefore:rollingAfter};
  if(sql.includes('FROM report2_evidence_source_cache')){
   if(!cache)return null;const body='{"id":"CACHED_CONTROLLED"}';return{payload_json:JSON.stringify({version:'provider-reference-cache-v1-20261004',url:CGURL,body,body_sha256:hash(body),received_ts:NOW-1000,expires_ts:NOW+60000})};
  }
  throw Error('UNEXPECTED_MOCK_SQL:'+sql);
 }};},async batch(statements){return statements.map(s=>{trace.push({op:'batch',sql:s.sql,params:s.params});return{success:true};});}};
 return{db,trace};
}
export {dbFixture};
