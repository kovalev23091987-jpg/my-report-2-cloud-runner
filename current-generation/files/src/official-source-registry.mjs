import {parseSupplementalIdentityRegistry} from './supplemental-candidate-context.mjs';

export const OFFICIAL_SOURCE_REGISTRY_VERSION='official-source-registry-v1-20260928';
const EVM=/^0x[0-9a-f]{40}$/i;
const clean=value=>String(value??'').trim();
const baseOf=contract=>clean(contract).toUpperCase().replace(/[-_/]?(USDT|USD|USDC|PERP)$/,'');
const hostOf=value=>{try{return new URL(value).protocol==='https:'?new URL(value).hostname.toLowerCase():null;}catch{return null;}};
const withinDomain=(host,domain)=>host===domain||host?.endsWith(`.${domain}`);
const exactIdentity=assetId=>{
 const match=/^([a-z0-9_-]+):(.*)$/i.exec(clean(assetId));if(!match)return null;
 const chain=match[1].toLowerCase(),address=match[2];
 if(chain==='solana')return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)?{chain,contract_or_mint:address}:null;
 return EVM.test(address)?{chain,contract_or_mint:address.toLowerCase()}:null;
};
const unique=values=>[...new Set(values.filter(Boolean))];

export function compileOfficialSourceRegistry(raw,{now=Date.now()}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('OFFICIAL_SOURCE_REGISTRY_OBJECT_REQUIRED');
 if(raw.schema!=='report2-official-event-sources-v1')throw new Error('OFFICIAL_SOURCE_REGISTRY_SCHEMA_MISMATCH');
 if(!Array.isArray(raw.entries))throw new Error('OFFICIAL_SOURCE_REGISTRY_ENTRIES_REQUIRED');
 const registry={},records=[];
 for(const [index,row] of raw.entries.entries()){
  const contract=clean(row?.contract_code).toUpperCase(),base=baseOf(contract),identity=exactIdentity(row?.asset_id),name=clean(row?.official_name),domain=clean(row?.official_domain).toLowerCase(),canonical=clean(row?.canonical_url),evidence=clean(row?.evidence_link),format=clean(row?.format).toUpperCase(),status=clean(row?.status).toUpperCase(),verified=Date.parse(row?.verified_at),refresh=clean(row?.refresh_period),timezone=clean(row?.timezone),parser=row?.parser_id===null?null:clean(row?.parser_id),snapshotSpace=clean(row?.snapshot_space),snapshotEvidence=clean(row?.snapshot_evidence_link);
  const fail=reason=>{throw new Error(`OFFICIAL_SOURCE_REGISTRY_INVALID:${index}:${reason}`);};
  if(!/^[A-Z0-9]{2,30}-USDT$/.test(contract)||!base)fail('CONTRACT_CODE');
  if(!identity)fail('ASSET_ID');
  if(!name)fail('OFFICIAL_NAME');
  if(!/^[a-z0-9.-]+$/.test(domain)||!domain.includes('.'))fail('OFFICIAL_DOMAIN');
  if(!withinDomain(hostOf(canonical),domain))fail('CANONICAL_URL');
  if(!withinDomain(hostOf(evidence),domain))fail('EVIDENCE_LINK');
  if(!Number.isFinite(verified)||verified>now+5*60_000)fail('VERIFIED_AT');
  if(!timezone||!/^\d+[mhd]$/.test(refresh))fail('REFRESH_METADATA');
  if(!['RSS','ATOM','ICS','HTML'].includes(format))fail('FORMAT');
  if(!['ENABLED','DISABLED'].includes(status))fail('STATUS');
  if(status==='ENABLED'&&!((['RSS','ATOM','ICS'].includes(format)&&parser===`FIXED_${format}_V1`)||(format==='HTML'&&['FIXED_HTML_JSONLD_V1','FIXED_HTML_CHAINLINK_NEWSROOM_V1'].includes(parser))))fail('ENABLED_PARSER');
  if(status==='DISABLED'&&(!clean(row?.disabled_reason)||parser!==null))fail('DISABLED_REASON');
  if(snapshotSpace&&(!/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(snapshotSpace)||!withinDomain(hostOf(snapshotEvidence),domain)))fail('SNAPSHOT_IDENTITY');
  const prior=registry[base];
  if(prior?.chain&&(`${prior.chain}:${prior.contract_or_mint}`!==`${identity.chain}:${identity.contract_or_mint}`))fail('ASSET_ID_CONFLICT');
  registry[base]={
   ...(prior||{}),chain:identity.chain,contract_or_mint:identity.contract_or_mint,official_name:name,
   official_domains:unique([...(prior?.official_domains||[]),domain]),
   official_feeds:unique([...(prior?.official_feeds||[]),...(status==='ENABLED'?[canonical]:[])]),
   official_feed_specs:[...(prior?.official_feed_specs||[]),...(status==='ENABLED'?[{url:canonical,format,parser_id:parser,refresh_period:refresh,timezone}]:[])],
   coingecko_id:clean(row?.coingecko_id)||prior?.coingecko_id||null,coingecko_category_id:clean(row?.coingecko_category_id)||prior?.coingecko_category_id||null,coingecko_category_name:clean(row?.coingecko_category_name)||prior?.coingecko_category_name||null,coinpaprika_id:clean(row?.coinpaprika_id)||prior?.coinpaprika_id||null,sector_tag:clean(row?.sector_tag)||prior?.sector_tag||null,snapshot_space:snapshotSpace||prior?.snapshot_space||null,protocol_slug:clean(row?.protocol_slug)||prior?.protocol_slug||null,
  };
  records.push({contract_code:contract,asset_id:`${identity.chain}:${identity.contract_or_mint}`,official_domain:domain,canonical_url:canonical,format,parser_id:parser,snapshot_space:snapshotSpace||null,snapshot_evidence_link:snapshotEvidence||null,timezone,evidence_link:evidence,verified_at:new Date(verified).toISOString(),refresh_period:refresh,status,disabled_reason:status==='DISABLED'?clean(row.disabled_reason):null});
 }
 return {version:OFFICIAL_SOURCE_REGISTRY_VERSION,status:records.length?'CLOSED':'NOT_CLOSED',registry,records};
}

export function mergeOfficialAndConfiguredRegistries({official,configured}={}){
 const compiled=official?.registry?official:compileOfficialSourceRegistry(official),parsed=parseSupplementalIdentityRegistry(configured||{}),merged={...compiled.registry};
 for(const [base,row] of Object.entries(parsed.entries||{})){
  const prior=merged[base],a=prior?.chain&&prior?.contract_or_mint?`${prior.chain}:${prior.contract_or_mint}`:null,b=row?.identity?`${row.identity.chain}:${row.identity.contract_or_mint}`:null;
  if(a&&b&&(row.identity?.chain==='solana'?a!==b:a.toLowerCase()!==b.toLowerCase()))throw new Error(`SUPPLEMENTAL_IDENTITY_REGISTRY_CONFLICT:${base}`);
  merged[base]={...(prior||{}),...(row||{}),...(row?.identity||(!prior?.chain?{}:{chain:prior.chain,contract_or_mint:prior.contract_or_mint})),coinpaprika_id:row?.coinpaprika_id||prior?.coinpaprika_id||null,sector_tag:row?.sector_tag||prior?.sector_tag||null,protocol_slug:row?.protocol_slug||prior?.protocol_slug||null,official_name:row?.official_name||prior?.official_name||null,official_domains:unique([...(prior?.official_domains||[]),...(row?.official_domains||[])]),official_feeds:unique([...(prior?.official_feeds||[]),...(row?.official_feeds||[])]),official_feed_specs:[...(prior?.official_feed_specs||[]),...(row?.official_feed_specs||[])]};
 }
 return {version:OFFICIAL_SOURCE_REGISTRY_VERSION,status:Object.keys(merged).length?'CLOSED':'NOT_CLOSED',registry:merged,versioned_records:compiled.records.length,configured_status:parsed.status};
}

export default{compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries};
