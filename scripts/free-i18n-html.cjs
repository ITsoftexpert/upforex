// Translate visible text with ordinary HTML tags. Reattach the original slot
// attributes and empty icon/code placeholders only after validating the tree.
const u=require('./i18n-release-utils.cjs');
const {skeleton}=require('./i18n-utils.cjs');
function nodes(root){return(root.childNodes||[]).flatMap(node=>[node,...nodes(node)]);}
function clone(node,parent){const {parentNode,childNodes,attrs,...rest}=node;const result={...rest,parentNode:parent};if(attrs)result.attrs=attrs.map(attr=>({...attr}));if(childNodes)result.childNodes=childNodes.map(child=>clone(child,result));return result;}
function prepareHtml(source){
  const original=u.parseFragment(source),copy=u.parseFragment(source),removed=[];
  const leaves=nodes(original).filter(node=>node.nodeName==='#text'&&u.normalizeContent(node.value));
  if(leaves.length===1){
    return {input:u.text(original),restore:translated=>{
      translated=translated.replace(/<(\/?)(?:envergure|portée|lapso|intervalo|Spanne|período|extensão|диапазон|跨度|スパン|स्पैन|अवधि|امتداد)(?=[\s>])/giu,'<$1span');
      const parsed=u.parseFragment(translated);
      for(const node of nodes(parsed))if(node.tagName&&(node.tagName!=='span'||node.attrs.some(attr=>attr.name!=='data-i18n-slot'||!/^\d+$/.test(attr.value))))throw new Error('Translated visible HTML tree changed; requires review');
      const result=clone(original,undefined),text=u.text(parsed);
      const leaf=nodes(result).find(node=>node.nodeName==='#text'&&u.normalizeContent(node.value));leaf.value=text;
      return u.serialize(result);
    }};
  }
  for(const node of nodes(copy))if(node.tagName){node.attrs=[];}
  for(const node of nodes(copy))if(node.tagName&&!u.normalizeContent(u.text(node))&&node.parentNode){
    if(!node.parentNode.tagName||u.normalizeContent(u.text(node.parentNode))){removed.push(node);node.parentNode.childNodes=node.parentNode.childNodes.filter(child=>child!==node);}
  }
  const emptyOriginal=new Set(nodes(original).filter(node=>node.tagName&&!u.normalizeContent(u.text(node))));
  const originalVisible=nodes(original).filter(node=>node.tagName&&!emptyOriginal.has(node));
  const expectedShape=skeleton(copy);
  return {input:u.serialize(copy),restore:translated=>{
    // These are observed translations of the structural word "span", not
    // visible content. Repair only the tag token and then verify the tree.
    translated=translated.replace(/<(\/?)(?:envergure|portée|lapso|intervalo|Spanne|período|extensão|диапазон|跨度|スパン|स्पैन|अवधि|امتداد)(?=[\s>])/giu,'<$1span');
    const target=u.parseFragment(translated);
    // Occasionally a translation places a visible target-language word in an
    // empty span attribute. Move only such non-ASCII words back to text.
    for(const node of nodes(target))if(node.tagName){
      for(const attr of [...node.attrs])if(attr.value===''&&/^[^\x00-\x7f]+$/.test(attr.name)){
        const parent=node.parentNode,index=parent.childNodes.indexOf(node);
        parent.childNodes.splice(index,0,{nodeName:'#text',value:attr.name+' ',parentNode:parent});node.attrs=node.attrs.filter(item=>item!==attr);
      }
    }
    if(JSON.stringify(skeleton(target))!==JSON.stringify(expectedShape)){
      // A provider may omit a whole outer wrapper. Reapply it only when all
      // remaining element nesting already matches the exact inner tree.
      let sourceRoot=copy;const wrappers=[];
      while(true){
        const meaningful=sourceRoot.childNodes.filter(node=>node.tagName||u.normalizeContent(u.text(node)));
        if(meaningful.length!==1||!meaningful[0].tagName)break;
        const element=meaningful[0];wrappers.push(element);sourceRoot=element;
        if(JSON.stringify(skeleton({childNodes:element.childNodes}))===JSON.stringify(skeleton(target))){
          let children=target.childNodes;
          for(const wrapper of [...wrappers].reverse()){
            const node={nodeName:wrapper.nodeName,tagName:wrapper.tagName,namespaceURI:wrapper.namespaceURI,attrs:[],childNodes:children};children.forEach(child=>child.parentNode=node);children=[node];
          }
          target.childNodes=children;children.forEach(child=>child.parentNode=target);break;
        }
      }
    }
    if(JSON.stringify(skeleton(target))!==JSON.stringify(expectedShape))throw new Error('Translated visible HTML tree changed; requires review');
    const visible=nodes(target).filter(node=>node.tagName),mapping=new Map([[original,target]]);
    originalVisible.forEach((node,index)=>{mapping.set(node,visible[index]);visible[index].attrs=node.attrs.map(attr=>({...attr}));});
    for(const node of nodes(original))if(emptyOriginal.has(node)&&!emptyOriginal.has(node.parentNode)){
      const parent=mapping.get(node.parentNode);if(!parent)throw new Error('Empty placeholder parent changed');
      const siblings=node.parentNode.childNodes,index=siblings.indexOf(node),next=siblings.slice(index+1).find(sibling=>mapping.has(sibling));
      const cloned=clone(node,parent);
      const position=next?parent.childNodes.indexOf(mapping.get(next)):-1;
      if(position<0)parent.childNodes.push(cloned);else parent.childNodes.splice(position,0,cloned);
    }
    if(JSON.stringify(skeleton(target))!==JSON.stringify(skeleton(original)))throw new Error('Restored original slot structure differs');
    return u.serialize(target);
  }};
}
module.exports={prepareHtml};
