// Exact-source assistant bilingual corrections. No human-review claim, API
// request, new marketing proposition, number change or page completion flag.
const fs = require('node:fs');
const u = require('./i18n-release-utils.cjs');
const {prepareHtml} = require('./free-i18n-html.cjs');
const {plain, identityProblems} = require('./review-free-catalogs.cjs');
const {financialConsistency} = require('./free-i18n-domain.cjs');
const inventory = u.read('tmp/native-content-inventory.json').entries;
const file = 'scripts/i18n-reviewed-translations.json', memory = u.read(file);
const corrections = [
  ['What Influences Gold and Silver Prices? | UPFOREX', {
    hi:'सोने और चाँदी की कीमतों को क्या प्रभावित करता है? | UPFOREX',
    ar:'ما الذي يؤثر في أسعار الذهب والفضة؟ | UPFOREX',
    fr:'Qu’est-ce qui influence les prix de l’or et de l’argent ? | UPFOREX',
    es:'¿Qué influye en los precios del oro y la plata? | UPFOREX',
    de:'Was beeinflusst die Preise von Gold und Silber? | UPFOREX',
    'zh-CN':'哪些因素影响黄金和白银价格？ | UPFOREX',
    'zh-TW':'哪些因素影響黃金和白銀價格？ | UPFOREX',
    ja:'金と銀の価格に影響する要因は？ | UPFOREX',
    pt:'O que influencia os preços do ouro e da prata? | UPFOREX',
    ru:'Что влияет на цены золота и серебра? | UPFOREX',
  }],
  ['Forex & Trading Blog | Strategies & Analysis | UPFOREX', {
    hi:'फ़ॉरेक्स और ट्रेडिंग ब्लॉग | रणनीतियाँ और विश्लेषण | UPFOREX',
    ar:'مدونة الفوركس والتداول | استراتيجيات وتحليلات | UPFOREX',
    fr:'Blog Forex et trading | Stratégies et analyses | UPFOREX',
    es:'Blog de forex y trading | Estrategias y análisis | UPFOREX',
    de:'Forex- und Trading-Blog | Strategien und Analysen | UPFOREX',
    'zh-CN':'外汇与交易博客 | 策略与分析 | UPFOREX',
    'zh-TW':'外匯與交易部落格 | 策略與分析 | UPFOREX',
    ja:'外国為替・トレーディングブログ | 戦略と分析 | UPFOREX',
    pt:'Blog de forex e trading | Estratégias e análises | UPFOREX',
    ru:'Блог о форексе и торговле | Стратегии и анализ | UPFOREX',
  }],
  ['spot metal trading online in Dubai', {
    hi:'दुबई में ऑनलाइन स्पॉट धातु ट्रेडिंग', ar:'تداول المعادن الفوري عبر الإنترنت في دبي',
    fr:'Trading de métaux au comptant en ligne à Dubaï', es:'Comercio de metales al contado en línea en Dubái',
    de:'Online-Spothandel mit Metallen in Dubai', 'zh-CN':'迪拜在线现货金属交易', 'zh-TW':'杜拜線上現貨金屬交易',
    ja:'ドバイでのオンライン金属現物取引', pt:'Negociação online de metais à vista em Dubai', ru:'Онлайн-торговля металлами на спотовом рынке в Дубае',
  }],
  ['For example, with 1:100 leverage, every $1 of required margin can support a market position worth $100, subject to the provider\'s margin requirements and trading conditions.', {
    hi:'उदाहरण के लिए, 1:100 लीवरेज के साथ, आवश्यक मार्जिन का प्रत्येक $1, प्रदाता की मार्जिन आवश्यकताओं और ट्रेडिंग शर्तों के अधीन, $100 मूल्य की बाज़ार पोज़िशन का आधार बन सकता है।',
    ar:'على سبيل المثال، مع رافعة مالية بنسبة 1:100، يمكن لكل $1 من الهامش المطلوب أن يدعم مركزًا في السوق بقيمة $100، وذلك وفقًا لمتطلبات الهامش وشروط التداول لدى مقدم الخدمة.',
    fr:'Par exemple, avec un effet de levier de 1:100, chaque $1 de marge requise peut permettre de détenir une position de marché d’une valeur de $100, sous réserve des exigences de marge et des conditions de négociation du prestataire.',
    es:'Por ejemplo, con un apalancamiento de 1:100, cada $1 de margen requerido puede respaldar una posición de mercado por valor de $100, sujeto a los requisitos de margen y las condiciones de negociación del proveedor.',
    de:'Beispielsweise kann bei einem Hebel von 1:100 jeder $1 an erforderlicher Margin eine Marktposition im Wert von $100 ermöglichen, vorbehaltlich der Margin-Anforderungen und Handelsbedingungen des Anbieters.',
    'zh-CN':'例如，在 1:100 杠杆下，每 $1 所需保证金可支持价值 $100 的市场头寸，具体取决于提供商的保证金要求和交易条件。',
    'zh-TW':'例如，在 1:100 槓桿下，每 $1 所需保證金可支持價值 $100 的市場部位，具體取決於提供商的保證金要求和交易條件。',
    ja:'例えば、レバレッジが 1:100 の場合、必要証拠金 $1 ごとに、市場価値 $100 のポジションを保有できる可能性があります。ただし、提供業者の証拠金要件と取引条件が適用されます。',
    pt:'Por exemplo, com alavancagem de 1:100, cada $1 de margem exigida pode sustentar uma posição de mercado no valor de $100, sujeito aos requisitos de margem e às condições de negociação do provedor.',
    ru:'Например, при кредитном плече 1:100 каждый $1 необходимой маржи может обеспечивать рыночную позицию стоимостью $100 с учетом маржинальных требований и торговых условий поставщика услуг.',
  }],
  ['However, this relationship is not fixed. Other market conditions can influence prices at the same time.', {
    ar:'ومع ذلك، فإن هذه العلاقة ليست ثابتة. فقد تؤثر ظروف السوق الأخرى في الأسعار في الوقت نفسه.',
  }],
  ['0.0002, or 2 pips', {ar:'0.0002، أو 2 نقطة (pip)'}],
  ['Both the bid and ask have risen by 2 pips.', {ar:'ارتفع كلٌّ من سعري العرض والطلب بمقدار 2 نقطة (pip).'}],
];
// Uppercase CMS tags are an explicit case-only variant of this same noun
// phrase, not a general case-folding rule for arbitrary English words.
corrections.push(['SPOT METAL TRADING ONLINE IN DUBAI', corrections[2][1]]);
let changed = 0;
for (const [source, targets] of corrections) {
  const entries = inventory.filter(entry => plain(entry.english, entry.kind) === source);
  if (!entries.length) throw new Error('Exact English source not found: ' + source);
  for (const entry of entries) for (const [language, target] of Object.entries(targets)) {
    const translation = entry.kind === 'html' ? prepareHtml(entry.english).restore(target) : target;
    const problems = [...u.validate(entry, translation, language), ...identityProblems(source, target), ...financialConsistency(source, target, language).problems];
    if (problems.length) throw new Error(language + ': ' + problems.join('; '));
    (memory[language] ||= {})[entry.key] = {english: entry.english, translation, reviewed: true, humanReviewed: false,
      reviewMethod: 'assistant-bilingual-exact-source-correction; original financial values, conditional wording and identities preserved'};
    changed++;
  }
}
fs.writeFileSync(file, JSON.stringify(memory, null, 2) + '\n');
console.log(JSON.stringify({correctedPairs: changed, humanReviewed: false, paidRequests: 0, completionDeclared: false}));
