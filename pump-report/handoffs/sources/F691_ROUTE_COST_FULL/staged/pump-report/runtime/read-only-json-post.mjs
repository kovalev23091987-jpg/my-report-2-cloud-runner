import {BudgetRefusal} from './budget.mjs';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':plain(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
export function admittedReadOnlyJSONPost(policy,target,body){
  if(!plain(body)||target.search||target.hash||!Array.isArray(policy?.readonly_json_post_templates)||policy.readonly_json_post_templates.length<1||policy.readonly_json_post_templates.length>10)throw new BudgetRefusal('EXACT_READONLY_JSON_POST_NOT_ADMITTED');
  let raw;
  try{raw=JSON.stringify(body);if(!raw||new TextEncoder().encode(raw).byteLength>4096)throw Error();const decoded=JSON.parse(raw);if(stable(decoded)!==stable(body))throw Error();}catch{throw new BudgetRefusal('BOUNDED_JSON_POST_BODY_REQUIRED');}
  const canonical=stable(body);
  const admitted=policy.readonly_json_post_templates.some(t=>t?.method==='POST'&&t.read_only===true&&t.path===target.pathname&&plain(t.body)&&stable(t.body)===canonical);
  if(!admitted)throw new BudgetRefusal('EXACT_READONLY_JSON_POST_NOT_ADMITTED');
  return {method:'POST',read_only_json_post:true,body_text:canonical};
}
