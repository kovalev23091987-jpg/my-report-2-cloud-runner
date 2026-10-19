// Descriptive metadata for exact, already selected N12 context origins.
// Original clocks only: null means unavailable, never a new admission or ACK.
export function n12CompositeFirstKnown(input){
 const {contract,evidence_ids:ids,component_origins:origins,decision_ts:at}=input??{};
 const time=x=>Number.isSafeInteger(x)&&x>0;
 if(typeof contract!=='string'||!/^[^\s-]+-USDT$/.test(contract)||!time(at)||
  !Array.isArray(ids)||!ids.length||!Array.isArray(origins)||origins.length!==ids.length||
  ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)return null;
 const expected=new Set(ids),seen=new Set();let latest=null;
 for(const origin of origins){
  if(!origin||!expected.has(origin.evidence_id)||seen.has(origin.evidence_id)||
   origin.htx_contract!==contract||origin.origin_status!=='EXACT_SELECTED_EVIDENCE')return null;
  const {source_ts:source,observed_ts:observed,first_known_ts:known,expires_at:expires}=origin;
  if(![source,observed,known,expires].every(time)||source>known||known>observed||
   observed>at||expires<observed||expires<at)return null;
  seen.add(origin.evidence_id);latest=latest===null?known:Math.max(latest,known);
 }
 return seen.size===expected.size?latest:null;
}
