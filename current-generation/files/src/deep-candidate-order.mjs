export const DEEP_CANDIDATE_ORDER_VERSION='deep-candidate-order-v1-20260929';
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const text=value=>String(value??'').trim().toUpperCase();
export function hasCurrentDirectionalContext(row){
 const source=row?._v3_discovery_source||row||{};
 const hint=text(source.discovery_direction_hint??source.early_candidate_direction_hint??source.direction_hint);
 return ['LONG','SHORT','LONG_WATCH','SHORT_WATCH'].includes(hint);
}
export function compareOrdinaryDeepCandidates(a,b){
 const aScore=finite((a?._v3_discovery_source||a)?.selection_score_0_100),bScore=finite((b?._v3_discovery_source||b)?.selection_score_0_100);
 if(aScore!==null&&bScore!==null&&aScore!==bScore)return bScore-aScore;
 const directionDelta=Number(hasCurrentDirectionalContext(b))-Number(hasCurrentDirectionalContext(a));if(directionDelta)return directionDelta;
 const aRank=finite(a?.priority_rank)??Infinity,bRank=finite(b?.priority_rank)??Infinity;if(aRank!==bRank)return aRank-bRank;
 const aTs=finite(a?.last_check_ts)??-Infinity,bTs=finite(b?.last_check_ts)??-Infinity;if(aTs!==bTs)return aTs-bTs;
 return text(a?.contract).localeCompare(text(b?.contract));
}
export default{DEEP_CANDIDATE_ORDER_VERSION,hasCurrentDirectionalContext,compareOrdinaryDeepCandidates};
