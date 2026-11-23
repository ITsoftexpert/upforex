/** Stable keys shared by extraction, catalog validation and the runtime. */
import { MARKET_IDENTIFIERS } from './market-identifiers';
const marketCode = '(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|INR|AED|ZAR|SGD|MYR|PHP|HKD|MXN|NOK|PLN|SEK|TRY|BTC|ETH|BCH|BSV|UNI|DOT|DOG|XAU|XAG|ADA|AVE|BNB|DSH|EOS|LNK|LTC|THT|TRX|XEM|XLM|XMR|XRP|XTZ)';
const currencyPair = new RegExp(`^${marketCode}\\s*\\/?\\s*${marketCode}(?:\\s*=\\s*\\d+(?:[.,]\\d+)*)?$`, 'i');
const marketAmount = new RegExp(`^(?:${marketCode}|[\\d\\s+×÷*/=().,:$€£¥₹−%–-])+$`);
const containsMarketCode = new RegExp(marketCode);
export function normalizeContent(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function contentKey(value: string): string {
  const text = normalizeContent(value);
  let left = 2166136261;
  let right = 5381;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right, 33) ^ code;
  }
  return 't' + (left >>> 0).toString(16).padStart(8, '0') +
    (right >>> 0).toString(16).padStart(8, '0');
}

export function needsContentTranslation(value: string): boolean {
  const text = normalizeContent(value);
  if (!/[A-Za-z]/.test(text)) return false;
  if (MARKET_IDENTIFIERS.has(text)) return false;
  if (/^(?:Apple \(AAPL\)|Tesla \(TSLA\)|Nvidia \(NVDA\))$/.test(text)) return false;
  // The comparison table's quote range and source brands are fixed data.
  if (/^\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*\(\s*Myfxbook\s*,\s*IC Markets\s*\)$/.test(text)) return false;
  // Numeric clock values and international meridiem/time-zone abbreviations
  // are data. Words such as "during", "noon" and "midnight" still translate.
  if (/^\d{1,2}:\d{2}(?:\s*[ap]\.m\.)?(?:\s*[–-]\s*\d{1,2}:\d{2}(?:\/\d{1,2}:\d{2})?(?:\s*[ap]\.m\.)?)?(?:\s*(?:GST|EDT|EST|BST|GMT|ET))?$/.test(text)) return false;
  if (/^(?:Pepperstone|Meta|Nike|Deckers|VF Corporation|IC Markets)$/.test(text)) return false;
  if (/^MT5:\s*Windows,\s*Mac,\s*iOS,\s*Android$/.test(text)) return false;
  if (/^Bureau of Internal Revenue \(BIR\)(?:\s*[:：])?$/.test(text)) return false;
  if (/^[A-Z]{1,5}\d{5,}$/.test(text)) return false;
  if (/^(?:\.(?:ex[45]|mq[45]|set|tpl|pdf)|EA|EAs|MQL4|MQL5|VPS|RSI|MACD|ATR|SMA|EMA|ADX|MFI|Windows|Mac|macOS|iOS|Android|Linux|WebTrader|BCH|BSV|UNI|DOT|DOG)$/i.test(text)) return false;
  if (/^(?:Meta\s*Trader\s*[45](?: \(MT[45]\))?|MT[45] (?:iOS|Android|Windows|macOS)|MT4|NFP|CPI|FOMC|PPI|ESMA|FCA|ASIC|CySEC|NFA|CFTC|SARS|BIR|IRAS|John Doe|David Narrator|UPFOREX Financial Consultation LLC|Exness|XM Standard|XM Zero|Broadcom|Apple|Microsoft|Google|MetaQuotes)$/i.test(text)) return false;
  if (/^(?:https?:\/\/|mailto:|www\.)/i.test(text) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return false;
  if (/^[\w-]+(?:\.[\w-]+)+$/.test(text)) return false;
  // Product/market identifiers, social brands and testimonial author names
  // retain their original spelling; they are not untranslated marketing copy.
  if (/^(?:UP Global Markets Ltd|UPFOREX Financial Services LLC|UPFOREX LTD|Myfxbook|Pro-ECN|Elite-ECN|AMAZON)$/i.test(text)) return false;
  // ISO currency pairs are instrument identifiers, including when a quote is
  // displayed beside the pair. Do not translate either currency code.
  if (currencyPair.test(text) || /\d/.test(text) && containsMarketCode.test(text) && marketAmount.test(text)) return false;
  // A complete currency equation contains identifiers and fixed numeric
  // values, not prose. Keep it byte-for-byte, including the original quote.
  if (/^(?:€|US\$|USD|EUR|£|GBP|¥|JPY)\s*\d[\d,.]*\s*=\s*(?:€|US\$|USD|EUR|£|GBP|¥|JPY)\s*\d[\d,.]*$/.test(text)) return false;
  if (/^(?:US\$|[$€£¥]|USD|EUR|GBP|JPY)\s*\d[\d,.]*[KMBT]$/.test(text)) return false;
  if (/^(?:(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|INR|AED|ZAR|SGD|MYR|PHP|BTC|ETH|XAU|XAG){2}T?|DXY|TESLA|NVIDIA|E-Mini S&P 500 Fut|Meta ?Trader 5(?: \(MT5\))?|Instagram|LinkedIn|Facebook|Trustpilot|TikTok|UAE|Raviraj Singh Tomar|Umang Suthar|Yuvraj singh Kachhawa)$/i.test(text)) return false;
  if (/^(?:UPFOREX|MT5|FX|EQ|PM|BO|CFD|CFDs|ECN|STP|KYC|FSC|CMA|USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|INR|AED|ZAR|SGD|MYR|PHP|BTC|ETH|XAU|XAG)$/i.test(text)) return false;
  return true;
}
