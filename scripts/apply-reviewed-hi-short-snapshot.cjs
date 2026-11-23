// These source/target pairs were read together, with the financial-context
// corrections below. This is assistant review, never a native-human claim.
const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const {prepareHtml}=require('./free-i18n-html.cjs');
const {financialConsistency}=require('./free-i18n-domain.cjs');
const {plain,identityProblems}=require('./review-free-catalogs.cjs');
const rows=[1,2,3].flatMap(index=>u.read('scripts/i18n-review-snapshots/hi-blog-short-'+index+'.json'));
const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(row=>[row.key,row]));
const file='scripts/i18n-reviewed-translations.json',memory=u.read(file);
const corrections={
  t9018db52ae88968c:'सामान्य प्रोफ़ाइल',
  tac34a3ce84ffa9a0:'एक मजबूत इंट्रोड्यूसिंग ब्रोकर प्रोग्राम की क्या विशेषताएँ होती हैं?',
  td7575f00bd510090:'लिखित कमीशन और श्रेय-निर्धारण नियम',
  t4fe558438a15fc3f:'इंट्रोड्यूसिंग ब्रोकर और एफ़िलिएट के बीच क्या अंतर है?',
  t10a54c08f9259c9a:'सक्षम किए जाने पर वास्तविक धन जोखिम में पड़ता है',
  t46f975b1f5e7b9c3:'विवेकपूर्ण आकलन और छँटाई की आवश्यकता है',
  t599d51b843187380:'खुदरा ट्रेडरों को नुकसान होता है',
  tc3c1261b4a7714c1:'खुदरा ट्रेडिंग',
  t472d253b08e31361:'खुदरा ट्रेडिंग',
  t3e31263a9f46de40:'विदेशी मुद्रा जोखिम',
  t9f44f729fb99794d:'लीवरेज से जुड़ा जोखिम',
  t368cbdccfe39162a:'अधिक लोगों को शुद्ध नुकसान होता है',
  t95005e5fafec4e01:'एक सरल उदाहरण: लीवरेज जोखिम कैसे असर डालता है',
  t1e06d1b92b7b2eb7:'केवल मूल्य संबंधी एक्सपोज़र',
  t033892c3ea72d24f:'लॉन्ग या शॉर्ट पोज़िशन लें - बाज़ार की दोनों दिशाओं में लाभ',
  t80af9b6bff66d275:'यूएई में सोने के CFD पर कितना लीवरेज उपलब्ध है?',
  tb1dd95210b87e051:'कम',
  t6ad38dba103e794e:'निष्क्रिय, कम लागत वाला एक्सपोज़र',
  t3f92aa8ab654e89e:'सीधे प्रबंधन में शामिल न होने वाले, विविधीकृत निवेशक',
  te979458be506db2d:'प्रवेश के लिए न्यूनतम राशि',
  t2d96bc3631c4927c:'लॉन्ग या शॉर्ट पोज़िशन लें: दोनों दिशाओं में लाभ',
  t4ec9b22ddc2eec43:'एक्सचेंज और नियामक की निगरानी',
  ta681c36c6e08e2f2:'प्रतिभूति और कमोडिटी प्राधिकरण',
  t36b734d657a489b4:'3. लीवरेज के अवसर',
  t16077db169e337c3:'6. ट्रेडरों को Upforex पर विचार क्यों करना चाहिए?',
  tf41e2dcdc37ffbef:'यूएई में सोने और चाँदी की ऑनलाइन ट्रेडिंग',
  t7e1419390127ddb9:'4. सीएफडी (अंतर के अनुबंध)',
  t74387cafdb89efd1:'इसके कारण ये हैं:',
  t5fa71a0a6f17ba70:'1. सपोर्ट स्तर पर खरीदें',
  tdc2d4680f5eebfca:'शेयर की कीमतें कई कारणों से बदलती हैं:',
  t0811ec7486139572:'बदले जा सकने वाले दृश्य',
  tc2b72cfb62f2de17:'यूएई में सोने की ट्रेडिंग',
  t155d5da67a5f665c:'<span data-i18n-slot="0">टेक-प्रॉफ़िट ऑर्डर</span> लाभ सुरक्षित करने के लिए आपके तय किए हुए मूल्य पर ट्रेड बंद करते हैं।',
  tc3f37967669e4bc5:'UPFOREX ट्रेडिंग',
  t9aed486d58a0e39f:'यूएई में विनियमित फ़ॉरेक्स ब्रोकर',
  t92ff3cadc85a901f:'यूएई में विनियमित फ़ॉरेक्स ब्रोकर',
  tb3f42756cbbe0a2a:'कोई अभिरक्षा शुल्क नहीं',
  tb2dfd1ad839dce05:'वैश्विक बाज़ारों का एक्सपोज़र',
  t0c076441f725bb57:'लॉन्ग/शॉर्ट पोज़िशन का लचीलापन',
  t5ffadbef5268dad5:'फ़ॉरेक्स में स्प्रेड',
  t8ab7a118d6f4b924:'स्प्रेड क्या है',
  t599f59cf3b915a75:'फ़ॉरेक्स में स्प्रेड',
  t42a418517235081b:'स्प्रेड लाभ को कैसे प्रभावित करता है?',
  td1c728117895c9e9:'2. मार्केट निष्पादन और स्लिपेज',
  te4b17c78d341e09c:'अनुभवी ट्रेडरों के लिए हमें अलग पहचान देने वाली बातें ये हैं:',
  teaac7f19f241e623:'ग्राहक निधि पृथक बैंक खातों में रखी जाती है',
  td2520c7a7d3f33a2:'पृथक रखी गई ग्राहक निधि',
  tabc8da8239a1985a:'पृथक रखे गए ग्राहक खाते',
  te1fe1964f630b1ac:'स्कैल्पिंग रणनीतियाँ (जहाँ मिलीसेकंड मायने रखते हैं)',
  tafd61729e37f53eb:'संभावित नुकसान को सीमित करने के लिए स्टॉप लॉस (SL)',
  tdf8235358a403fdb:'निचली ओर के जोखिम से बचाव करते हुए लाभ वाले ट्रेडों को जारी रखने के लिए ट्रेलिंग स्टॉप',
  tbea99cf7aee09aff:'हमारा प्लेटफ़ॉर्म अनुशासन को स्वचालित करने में मदद करता है, ताकि आपको हर ट्रेड का बारीकी से प्रबंधन न करना पड़े।',
  t505ae53b1981586f:'5. निःशुल्क शिक्षण केंद्र और ट्रेडिंग सिग्नल',
  tf4b098a74b005ae1:'UpForex के साथ फ़ॉरेक्स ट्रेडिंग = आत्मविश्वास के साथ ट्रेडिंग',
  t12387b25b9c6e279:'3. तत्काल निकासी के साथ फ़ॉरेक्स ट्रेडिंग',
  t02f488692e6a75e7:'4. उन्नत ट्रेडिंग उपकरण और कम स्प्रेड',
  t9d35531a03295254:'विकास को गति देने वाले कारकों का व्यापक संगम',
  tbd49eeb03e3ba47a:'5. स्लिपेज के बिना तेज़ ऑर्डर निष्पादन',
  t48b7c05757c3eee7:'रेंज के बाहर कैंडल की मजबूत क्लोज़िंग (केवल ऊपर/नीचे थोड़ी देर के लिए बनी विक नहीं)।',
  t2ac5162e6d59c0cc:'आपको पेशेवर ट्रेडरों जैसा (या उससे बेहतर) बेहद तेज़ निष्पादन मिलता है।',
  t2730ebcca84ebdfc:'अधिक कठिन सीखने की प्रक्रिया की कीमत पिप्स में चुकानी पड़ती है',
  t64816bc6190951d6:'आत्मविश्वास बढ़ाना',
  tffd2cf7b0c9b9fcf:'गिरावट',
  t3dc2d53b0c875ecf:'गिरावट',
  teddaf9e09bf7445a:'अमेरिका के 10-वर्षीय बॉन्ड की प्रतिफल दर गिरकर 4.03% हो गई, क्योंकि निवेशक सुरक्षित निवेशों की ओर बढ़े।',
};
let accepted=0;
for(const row of rows){
  // This label needs its original investment-table context before approval.
  if(row.key==='t7e3e155979425751')continue;
  if(!u.needsContentTranslation(plain(row.english,row.kind)))continue;
  const entry=inventory.get(row.key);
  if(!entry||entry.english!==row.english)throw new Error('Reviewed source changed: '+row.key);
  const replacement=corrections[row.key];
  const translation=replacement?(entry.kind==='html'&&!replacement.includes('data-i18n-slot')?prepareHtml(entry.english).restore(replacement):replacement):row.translation;
  const problems=[...u.validate(entry,translation,'hi'),...identityProblems(plain(entry.english,entry.kind),plain(translation,entry.kind)),...financialConsistency(plain(entry.english,entry.kind),plain(translation,entry.kind),'hi').problems];
  if(problems.length)throw new Error(row.key+': '+problems.join('; '));
  (memory.hi||={})[row.key]={english:entry.english,translation,reviewed:true,humanReviewed:false,
    reviewMethod:'assistant-bilingual-source-target-review; corrected financial leverage/exposure, retail-trading, negation and agency terminology'};
  accepted++;
}
fs.writeFileSync(file,JSON.stringify(memory,null,2)+'\n');
console.log(JSON.stringify({accepted,humanReviewed:false,paidRequests:0,completionDeclared:false}));
