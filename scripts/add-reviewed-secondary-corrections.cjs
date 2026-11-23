const fs=require('node:fs'),u=require('./i18n-release-utils.cjs');
const inventory=new Map(u.read('tmp/native-content-inventory.json').entries.map(row=>[row.key,row]));
const file='scripts/i18n-reviewed-translations.json',memory=u.read(file);
const corrections={
  fr:{t1418e499fecf4155:'4. S’entraîner avec un compte de démonstration',tce20677ca906b8d2:'3. Effectuer les vérifications d’identité',td8e52126526ae76e:'4. Tester l’accès à la démonstration'},
  es:{
    tf0838a12679fcecc:'Aprenda cómo el apalancamiento, los pips, los diferenciales, los costos y la volatilidad afectan a cada operación y reserve solo dinero que pueda permitirse arriesgar.',
    t27017ba78d74a1e3:'1. Aprenda cómo el apalancamiento cambia el riesgo',
  },
  de:{t1418e499fecf4155:'4. Üben Sie mit einem Demokonto'},
  'zh-CN':{
    t25ac95c731f7ecbb:'Elite-ECN 账户公布的入金额为 $5,000，点差从 0.1 点（pip）起，不另收佣金。起始点差并非固定。UPFOREX 还公布了 50% 的追加保证金水平和 30% 的强制平仓水平。',
    t67bf66b157875119:'Standard 账户公布的最低入金门槛为 $100，是所公布门槛中最低的。该账户列出的浮动点差从 0.1 点（pip）起，不另收佣金。适用的点差仍是交易成本的一部分。',
    t90e433a463be729a:'了解杠杆、保证金、点（pip）、点差和波动性如何影响仓位。避免使用租金、学费、借款或日常开支所需的资金交易。',
    t734365cda8fa4545:'了解杠杆、保证金、点（pip）、点差和市场波动性如何影响仓位。谨慎选择交易规模，并仅使用与必要家庭开支及财务义务分开的资金。',
    te58dd389956a93e1:'风险警告：外汇和差价合约属于杠杆产品，涉及重大损失风险。您可能损失部分或全部本金，衍生品损失可能超过您的原始投资。交易可能并不适合每个人。入金前请确认法律实体、监管保护、账户费用和出金条款，并在需要时寻求独立的财务、法律和税务建议。',
    t8cd3f6e49858e5cc:'了解杠杆、保证金、点（pip）、点差、仓位规模和波动性如何影响交易。开立实盘仓位前，决定分配多少资金以及承担多少风险。',
    t12d4cf624b6f431e:'恩巴卡西',
  },
  'zh-TW':{
    t54e7b9c77f23598d:'外匯和差價合約交易使用槓桿，因此微小的市場變化會造成較大的收益或損失。開立實盤部位前，請了解點差、保證金、手數及停損控制。',
    tdbaec5138fbaeab7:'外匯和差價合約交易使用槓桿，因此微小的價格變化會造成較大的收益或損失。開立實盤部位前，請了解點差、保證金、手數及停損控制。',
    tc1cdc3c241148fd2:'透過 UPFOREX 交易場外指數差價合約。享有直接市場存取、任何裝置上的快速執行，以及投資組合對沖工具。',
    t5848fc5fce175a27:'阿聯酋外匯差價合約交易 | MT5 平台 | UPFOREX',
    tbe2a02eb8f787ded:'透過 MT5 上的外匯差價合約交易貨幣對。價格會隨利率、就業數據及市場新聞變動。請查看點差、保證金、合約規模及掉期成本。',
    td74673e5174557df:'如有提供，可在 MT5 上交易 WTI 和布倫特原油差價合約。能源差價合約會隨供應、需求、庫存量及全球事件變動。開放使用情形視帳戶所屬地區而異。',
    ta493f757c3d4de57:'Pro-ECN 帳戶公布的點差從零點（pip）起。符合條件的外匯和金屬交易適用每整手（round lot）$7 的佣金；其他金融商品不收取此類佣金。',
    tf33576475e1d0831:'1. 了解外匯和差價合約風險',
    t72472d952de903f3:'提交開戶過程中要求的身分、地址及其他資料。KYC 和 AML 程序可能要求額外文件。',
    t4f8858c0cd8b3bc4:'模擬帳戶可協助您了解軟體，並在不使用真實資金的情況下練習下單。模擬績效並不保證實盤的執行狀況或結果相同。入金前，請查看兌換成本、出金條款、提供服務的實體，以及您可接受的最大損失。',
    t3173715518a89dc1:'模里西斯金融服務委員會（FSC）',
    t106c17e3681ed60b:'透過 MT5 上的外匯差價合約交易貨幣對。利率決議、就業數據和市場新聞發布後，價格會變動。請查看點差、點（pip）、保證金、手數及掉期成本。',
    td7f2c8d410f2f760:'如有提供，可在 MT5 上交易<span data-i18n-slot="0">WTI 和布倫特原油差價合約</span>。能源差價合約會隨供應、需求、庫存量及全球事件變動。開放使用情形視帳戶和地區而異。',
    t813ca1b9344a3b27:'Pro-ECN 帳戶公布的點差從 0 點（pip）起。符合條件的外匯和金屬交易適用每整手（round lot）$7 的佣金。浮動點差可能隨市場狀況的變化而改變。',
    t8cd3f6e49858e5cc:'了解槓桿、保證金、點（pip）、點差、部位規模和波動性如何影響交易。開立實盤部位前，決定分配多少資金以及承擔多少風險。',
    t734365cda8fa4545:'了解槓桿、保證金、點（pip）、點差和市場波動性如何影響部位。謹慎選擇交易規模，並僅使用與必要家庭開支及財務義務分開的資金。',
    te7863bff645c41fb:'2. 檢視完整的交易成本',
    t141cf1644f87f232:'馬尼拉外匯交易 | UPFOREX MT5',
    tfc6d5b10b6037f5c:'<span data-i18n-slot="0">指數差價合約</span>追蹤同一市場中的一組公司。現金差價合約跟隨整體價格走勢。下單前，請查看交易時間、合約條款及保證金。',
    t27017ba78d74a1e3:'1. 了解槓桿如何改變風險',
    t70ca1d9a43c05ddc:'了解槓桿、保證金、點（pip）和價格波動性如何影響部位。使用與您準備承擔的風險程度相符的部位規模，並將必要生活資金與交易資本分開。',
    t38d3259cbba8393c:'3. 準備驗證文件',
    t90e433a463be729a:'了解槓桿、保證金、點（pip）、點差和波動性如何影響部位。避免使用租金、學費、借款或日常開支所需的資金交易。',
    tfab7735c9ab2ba52:'Q2：什麼是線上交易經紀商，為什麼它們很重要？',
    t53de83d6a4c3c9ae:'Q9：什麼是比特幣差價合約交易？',
    t39981fb576cb6abd:'Q18：股票差價合約交易是否收取佣金？',
    t12d4cf624b6f431e:'恩巴卡西',
  },
};
let added=0;
for(const [language,rows]of Object.entries(corrections))for(const [key,translation]of Object.entries(rows)){
  const entry=inventory.get(key);if(!entry)throw new Error('Exact source missing: '+key);
  const problems=u.validate(entry,translation,language);if(problems.length)throw new Error(key+': '+problems.join(', '));
  (memory[language]||={})[key]={english:entry.english,translation,reviewed:true,reviewMethod:'assistant-bilingual-source-meaning-and-financial-condition-review',humanReviewed:false};added++;
}
fs.writeFileSync(file,JSON.stringify(memory,null,2)+'\n');console.log(JSON.stringify({added,humanReviewed:false}));
