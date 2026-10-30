export function createCandidateCostQuoteBridge(binding){
 const frozen=Object.freeze({...binding});let source=null;
 return Object.freeze({hooks:Object.freeze({binding:()=>frozen,verify:(token,ctx)=>source?.verifyCandidateRouteCostQuote(token,ctx)??null,commit:(token,ctx)=>source?.commitCandidateRouteCostQuote(token,ctx)??false}),
 bind(value){if(source)throw Error('CANDIDATE_COST_SOURCE_ALREADY_BOUND');source=value;}});
}
