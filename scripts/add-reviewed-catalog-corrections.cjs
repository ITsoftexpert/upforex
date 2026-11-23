// Exact-source bilingual corrections. These are assistant-reviewed translations,
// not a claim of professional or native-speaker certification.
const fs=require('node:fs');
const inventory=JSON.parse(fs.readFileSync('tmp/native-content-inventory.json','utf8')).entries;
const file='scripts/i18n-reviewed-translations.json';
const memory=JSON.parse(fs.readFileSync(file,'utf8'));
const corrections={
  'Round-the-clock multilingual client support, 5 days a week':{
    hi:'सप्ताह में 5 दिन, चौबीसों घंटे बहुभाषी ग्राहक सहायता',
    ar:'دعم عملاء متعدد اللغات على مدار الساعة، 5 أيام في الأسبوع',
    fr:'Assistance client multilingue à toute heure, 5 jours par semaine',
    es:'Atención al cliente multilingüe durante todo el día, 5 días a la semana',
    de:'Mehrsprachiger Kundensupport rund um die Uhr, 5 Tage pro Woche',
    'zh-CN':'每周5天、全天候的多语言客户支持',
    'zh-TW':'每週5天、全天候的多語言客戶支援',
    ja:'週5日、昼夜を問わない多言語カスタマーサポート',
    pt:'Suporte ao cliente multilíngue durante todo o dia, 5 dias por semana',
    ru:'Круглосуточная многоязычная поддержка клиентов 5 дней в неделю',
  },
  'Run your EAs 24/7 with complimentary Virtual Private Server hosting':{
    hi:'निःशुल्क वर्चुअल प्राइवेट सर्वर होस्टिंग के साथ अपने EA को 24/7 चलाएँ',
    ar:'شغّل مستشاريك الآليين (EA) على مدار 24/7 مع استضافة مجانية لخادم افتراضي خاص',
    fr:'Exécutez vos EA 24/7 avec un hébergement offert sur serveur privé virtuel',
    es:'Ejecute sus EA 24/7 con alojamiento gratuito en un servidor privado virtual',
    de:'Betreiben Sie Ihre EAs 24/7 mit kostenlosem Hosting auf einem virtuellen privaten Server',
    'zh-CN':'通过免费的虚拟专用服务器托管，24/7运行您的EA',
    'zh-TW':'透過免費的虛擬專用伺服器託管，24/7運行您的EA',
    ja:'無料の仮想専用サーバーホスティングでEAを24/7稼働させましょう',
    pt:'Execute seus EAs 24/7 com hospedagem gratuita em um servidor privado virtual',
    ru:'Запускайте своих торговых советников (EA) 24/7 с бесплатным размещением на виртуальном выделенном сервере',
  },
};
let added=0;
for(const [english,translations]of Object.entries(corrections)){
  const entry=inventory.find(row=>row.kind==='text'&&row.english===english);
  if(!entry)throw new Error('Exact English source missing: '+english);
  for(const [language,translation]of Object.entries(translations)){
    (memory[language]||={})[entry.key]={english,translation,reviewed:true,reviewMethod:'assistant-bilingual-source-comparison',humanReviewed:false};added++;
  }
}
fs.writeFileSync(file,JSON.stringify(memory,null,2)+'\n');
console.log(JSON.stringify({added,englishSourceChanged:false,humanReviewed:false}));
