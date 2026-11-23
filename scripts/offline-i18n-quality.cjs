const u=require('./i18n-release-utils.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
// These are review-priority signals, not a claim that meaning can be proved
// from script detection, matching numbers, or the presence of a brand name.
function assessDraft(entry,translation,language){
  const structuralProblems=u.validate(entry,translation,language);
  const source=u.normalizeContent(entry.kind==='html'?u.text(u.parseFragment(entry.english)):entry.english);
  const target=typeof translation==='string'?u.normalizeContent(entry.kind==='html'?u.text(u.parseFragment(translation)):translation):'';
  const qualityFlags=[];
  for(const name of ['UPFOREX','UP Global Markets Ltd','Pro-ECN','Elite-ECN','MetaTrader','MT4','MT5']){
    if(source.toLowerCase().includes(name.toLowerCase())&&!target.toLowerCase().includes(name.toLowerCase()))qualityFlags.push('Product/company identity needs review: '+name);
  }
  if(source.length>100&&target.length<source.length*0.45)qualityFlags.push('Possible omitted sentence/content');
  if(/&(?:quot|apos|amp|lt|gt);/.test(target)&&!/&(?:quot|apos|amp|lt|gt);/.test(source))qualityFlags.push('Unexpected encoded text');
  const financialProblems=financialConsistency(source,target,language).problems;
  return {structuralProblems,qualityFlags,financialProblems,reviewed:false,semanticReviewComplete:false};
}
module.exports={assessDraft};
