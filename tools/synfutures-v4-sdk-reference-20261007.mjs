import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
const dir='checkpoints/synfutures-v4-candidate/';
const math=fs.readFileSync(dir+'sdk-math.ts','utf8'),position=fs.readFileSync(dir+'sdk-position.ts','utf8');
if(createHash('sha256').update(math).digest('hex')!=='e56d79d35c63c65f76f37010e743e0cff32bc17f3a9c362d034617e5319f8937'||createHash('sha256').update(position).digest('hex')!=='a6a1287abad458ceeb8715832973cc24e8254f711cfa4ca644d3862b942f23ea')throw Error('PINNED_CURRENT_SDK_SOURCE_DIGEST_MISMATCH');
function extract(source,signature){
 const start=source.indexOf(signature);if(start<0)throw Error('PINNED_SDK_SIGNATURE_MISSING:'+signature);
 const brace=source.indexOf('{',start);let depth=1,end=brace+1;
 for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
 if(depth)throw Error('PINNED_SDK_BODY_NOT_CLOSED');return source.slice(start,end).replace(/^export /,'');
}
const names=['wmulInt','ratioToWad','abs','fracUp','fracDown','wmulUp','wmulDown','wdivUp','wdivDown'];
const functions=names.map(name=>extract(math,(math.includes('export function '+name+'(')?'export ':'')+'function '+name+'(')).join('\n');
const methods=['fundingFee','socialLoss','liquidationPrice'].map(name=>extract(position,name+'(')).join('\n');
const code='const WAD=10n**18n,ZERO=0n,ONE=1n,PERP_EXPIRY=4294967295;\n'+functions+'\nclass Position { constructor(p){Object.assign(this,p);} '+methods+'}';
const Position=Function(stripTypeScriptTypes(code,{mode:'strip'})+'\nreturn Position;')();
export const sdkReference={repository:'SynFutures/ts-sdk',commit:'a09a3ed460c1fa727ed4df9db0218fd5aa949409',version:'0.2.8',method:'Position.liquidationPrice',math_sha256:createHash('sha256').update(math).digest('hex'),position_sha256:createHash('sha256').update(position).digest('hex'),extracted_sha256:createHash('sha256').update(code).digest('hex')};
export function candidateThreshold(ctx){
 const fail=reason=>({status:'NOT_USABLE',reason,production_enabled:false});
 try{
  if(ctx.condition!==0||ctx.amm?.status!==1||ctx.amm.expiry!==4294967295)return fail('INSTRUMENT_OR_AMM_NOT_TRADING');
  const pf=ctx.portfolio;if(!pf||['oids','rids','orders','ranges','ordersTaken'].some(k=>!Array.isArray(pf[k])||pf[k].length!==0))return fail('ORDERS_OR_RANGES_NOT_ACCOUNTED');
  const mmr=ctx.setting.maintenanceMarginRatio;if(!Number.isInteger(mmr)||mmr<=0||mmr>=10000||ctx.setting.param.qtype!==1)return fail('MARGIN_OR_STABLE_QUOTE_NOT_CLOSED');
  const p=Object.fromEntries(['balance','size','entryNotional','entrySocialLossIndex','entryFundingIndex'].map(k=>[k,BigInt(pf.position[k])]));
  const a={...ctx.amm,...Object.fromEntries(['longSocialLossIndex','shortSocialLossIndex','longFundingIndex','shortFundingIndex'].map(k=>[k,BigInt(ctx.amm[k])]))};
  if(p.size===0n)return fail('NO_OPEN_POSITION');if(p.entryNotional<=0n||p.entrySocialLossIndex<0n||p.balance<0n)return fail('POSITION_STATE_NOT_CLOSED');
  const side=p.size>0n?'LONG':'SHORT',currentLoss=side==='LONG'?a.longSocialLossIndex:a.shortSocialLossIndex;
  if(currentLoss<p.entrySocialLossIndex)return fail('NEGATIVE_SOCIAL_LOSS_DELTA');
  const mark=BigInt(ctx.priceData.markPrice);if(mark<=0n)return fail('MARK_NOT_CLOSED');
  const price=new Position(p).liquidationPrice(a,mmr);if(price<=0n)return fail('NO_POSITIVE_THRESHOLD');
  if(side==='LONG'?price>=mark:price<=mark)return fail('THRESHOLD_NOT_FUTURE');
  return{status:'CONDITIONAL_SDK_THRESHOLD_NATIVE_ONLY',side,price_wad:String(price),price_unit:'STABLE_QUOTE_PER_BASE_WAD',mark_wad:String(mark),mmr_bps:mmr,production_enabled:false,cex_identity_closed:false,consumer_closed:false,method:sdkReference,assumption:'Pinned isolated instrument position, balances, funding/social-loss indexes and maintenance margin stay fixed; orders and liquidity ranges absent.'};
 }catch{return fail('POSITION_OR_MODEL_INPUT_NOT_CLOSED');}
}
