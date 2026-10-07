import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {exactNativeSectorBinding} from './coingecko-sector-evidence.mjs';

export const GITHUB_RELEASES_VERSION='github-official-releases-v1-20261007';
export const GITHUB_RELEASE_LIMITS=Object.freeze({daily_cap:12,background_daily_cap:8,ttl_ms:6*60*60_000,maximum_rows:10,retries:0});
const digest=x=>createHash('sha256').update(x).digest('hex');
const host=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.hostname:null;}catch{return null;}};
export function exactGithubReleaseSpec(url,metadata){
 const s=(metadata?.official_feed_specs||[]).find(s=>s.url===url&&s.format==='JSON'&&s.parser_id==='FIXED_GITHUB_RELEASES_V1');
 if(!s||!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(s.github_repository||'')||url!==`https://api.github.com/repos/${s.github_repository}/releases?per_page=10`||!['STABLE_SEMVER_V1','APTOS_MAINNET_NODE_V1'].includes(s.release_policy))return null;
 const issuer=host(s.publisher_authorization_url);
 return (metadata.official_domains||[]).some(d=>issuer===d||issuer?.endsWith('.'+d))?s:null;
}
function stableRelease(row,s){
 if(row.draft!==false||row.prerelease!==false)return false;
 if(s.release_policy==='APTOS_MAINNET_NODE_V1')return /^aptos-node-v\d+\.\d+\.\d+(?:-hotfix)?$/.test(row.tag_name)&&/^\[Mainnet\]\s/i.test(row.name);
 return /^v?\d+\.\d+\.\d+$/.test(row.tag_name);
}
export function normalizeGithubReleases({contract,asset_identity,asset_metadata,feed_url,body,observed_ts}={}){
 const spec=exactGithubReleaseSpec(feed_url,asset_metadata),bad=status=>({status,evidence:[],events:[],feed_schema_checked:false,internal_only:true});
 if(!spec||!Number.isSafeInteger(observed_ts)||!exactNativeSectorBinding(asset_identity,contract))return bad('EXACT_OFFICIAL_RELEASE_BINDING_REQUIRED');
 let rows;try{rows=JSON.parse(body);}catch{return bad('SOURCE_FEED_SCHEMA_NOT_CLOSED');}
 if(!Array.isArray(rows)||rows.length>10)return bad('SOURCE_FEED_SCHEMA_NOT_CLOSED');
 const ids=new Set(),events=[];let schema=true,filtered=0;
 for(const row of rows){
  const ts=typeof row?.published_at==='string'&&/Z$/.test(row.published_at)?Date.parse(row.published_at):NaN;
  const valid=Number.isSafeInteger(row?.id)&&row.id>0&&!ids.has(row.id)&&typeof row.tag_name==='string'&&row.tag_name.length>0&&typeof row.name==='string'&&row.name.length>0&&typeof row.draft==='boolean'&&typeof row.prerelease==='boolean'&&Number.isSafeInteger(ts)&&ts<=observed_ts&&row.url===`https://api.github.com/repos/${spec.github_repository}/releases/${row.id}`&&row.html_url===`https://github.com/${spec.github_repository}/releases/tag/${encodeURIComponent(row.tag_name)}`;
  if(!valid){schema=false;continue;}ids.add(row.id);
  if(!stableRelease(row,spec)){filtered++;continue;}
  if(ts<observed_ts-7*24*60*60_000)continue;
  const event=buildEvidenceV2({provider_id:'OFFICIAL_EVENTS',upstream_id:`OFFICIAL_GITHUB:${spec.github_repository}`,asset_id:`${asset_identity.chain}:native:mainnet`,htx_contract:contract,block_id:'N07',metric_family:'OFFICIAL_SOFTWARE_RELEASE',origin_event_id:`GITHUB_RELEASE:${spec.github_repository}:${row.id}`,dependency_group:`OFFICIAL_PROJECT:${asset_identity.chain}:native:mainnet`,source_ts:ts,observed_ts,expires_at:observed_ts+GITHUB_RELEASE_LIMITS.ttl_ms,coverage_status:'OFFICIAL_PUBLISHED_SOFTWARE_RELEASE',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{official_url:row.html_url,event_title:row.name.slice(0,240),release_tag:row.tag_name,github_release_id:row.id,github_repository:spec.github_repository,release_policy:spec.release_policy,source_clock_policy:'ORIGINAL_RELEASE_PUBLISHED_AT',publisher_authorization_url:spec.publisher_authorization_url,mainnet_deployment_verified:false,all_official_channels_checked:false,entry_authorized:false}});
  events.push(event);
 }
 const result={status:events.length?'CLOSED':schema?'CLOSED_BOUNDED_OFFICIAL_FEED_CHECK':'SOURCE_FEED_SCHEMA_NOT_CLOSED',contract,evidence:events,events:[...events],feed_schema_checked:schema,checked_entry_count:ids.size,filtered_nonproduction_rows:filtered,source_scope:'ONE_OFFICIAL_REPOSITORY_RETURNED_RELEASE_SUBSET',all_official_channels_checked:false,internal_only:true};
 if(!events.length&&schema){result.check_completed=true;result.evidence.push(buildEvidenceV2({provider_id:'OFFICIAL_EVENTS',upstream_id:`OFFICIAL_GITHUB:${spec.github_repository}`,asset_id:`${asset_identity.chain}:native:mainnet`,htx_contract:contract,block_id:'N07',metric_family:'OFFICIAL_RELEASE_SUBSET_CHECK',origin_event_id:`${feed_url}:CHECK:${observed_ts}`,dependency_group:`OFFICIAL_PROJECT:${asset_identity.chain}:native:mainnet`,source_ts:observed_ts,observed_ts,expires_at:observed_ts+GITHUB_RELEASE_LIMITS.ttl_ms,coverage_status:'BOUNDED_OFFICIAL_RELEASE_SUBSET_CHECK',coverage_fraction:0,extra:{official_url:feed_url,github_repository:spec.github_repository,release_policy:spec.release_policy,publisher_authorization_url:spec.publisher_authorization_url,feed_response_sha256:digest(body),checked_entry_count:ids.size,recent_event_count:0,maximum_returned_rows:10,lookback_days:7,all_official_channels_checked:false,source_clock_policy:'OBSERVED_OFFICIAL_RELEASE_SUBSET_QUERY',entry_authorized:false}}));}
 return result;
}
