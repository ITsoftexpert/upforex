const u=require('./i18n-release-utils.cjs');
const {identityProblems}=require('./review-free-catalogs.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
function effectivePageMetadata(page,language,sheet,derived=u.read('scripts/data/reviewed-derived-metadata.json',{})){
 const explicit=sheet.pages[page]?.[language];
 if(explicit)return explicit;
 const row=derived[page],english=sheet.pages[page]?.en,target=row?.translations?.[language];
 if(!row||!target||language==='en')return undefined;
 if(row.reviewed!==true||row.humanReviewed!==false||JSON.stringify(row.english)!==JSON.stringify(english))throw new Error('Derived head must match its exact reviewed English source: '+page);
 for(const field of ['title','description']){
  const source=english[field],translation=target[field];
  const problems=[...u.validate({english:source,kind:'text'},translation,language),...identityProblems(source,translation),...financialConsistency(source,translation,language).problems];
  if(problems.length)throw new Error('Invalid derived '+field+': '+page+':'+language+': '+problems.join('; '));
 }
 return target;
}
module.exports={effectivePageMetadata};
