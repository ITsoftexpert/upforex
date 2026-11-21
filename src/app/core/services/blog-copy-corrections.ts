interface PublicBlogCopy {
  permaLink?: string;
  title?: string;
  metaTitle?: string;
  description?: string;
  content?: string;
  imageAltTag?: string;
}

type CopyReplacement = readonly [RegExp, string];

// Public blog copy is stored in the CMS, outside this repository. Keep these
// corrections scoped to the audited articles until their CMS copy is updated.
const replacementsBySlug: Record<string, readonly CopyReplacement[]> = {
  'how-to-use-mt5-expert-advisors-guide': [
    [
      /It may identify sedes\./g,
      'It may identify setups, size positions, place orders, apply stop-loss and take-profit levels, or manage open trades.',
    ],
    [
      /installation\.tups, size positions, place orders, apply stop-loss and take-profit levels, or manage open tra\b/g,
      'installation.',
    ],
  ],
  'strategy-snapshot-trading-breakouts': [[/\bLverage\b/g, 'Leverage']],
  'best-regulated-forex-platform': [[/financial authorities\.\./g, 'financial authorities.']],
  'zero-commission-forex-trading': [[/changing markets\.\./g, 'changing markets.']],
  'best-forex-trading-platform': [
    [/financing surprises\s+\./g, 'financing surprises.'],
    [/without commissions\s+\./g, 'without commissions.'],
  ],
  'forex-trading-in-dubai-laws-procedures-and-a-guide-for-beginners': [
    [/takes place online using online platforms/g, 'takes place using online platforms'],
  ],
  'forex-trading-with-instant-withdrawals': [[/\ba best forex trading platform\b/g, 'the best forex trading platform']],
  'how-to-start-forex-trading-for-beginners': [
    [/on a lot of best forex trading platform\b/g, 'on many of the best forex trading platforms'],
  ],
  'mt5-stock-trading-dubai-a-beneficial-guideline-for-uae-investors': [
    [/\ban user-friendly\b/g, 'a user-friendly'],
    [/professional\s+,/g, 'professional,'],
  ],
  '5-key-differences-between-forex-demo-and-real-account': [
    [/5 Crucial Difference Between Forex Demo and Real Account\b/g, '5 Crucial Differences Between Forex Demo and Real Accounts'],
  ],
  'learn-how-to-trade-gold-online-techniques-and-insights': [
    [/with strategies, and best practices/g, 'with strategies and best practices'],
  ],
  'forex-broker-with-fund-protection': [
    [
      /At UpForex, we prioritize both forex broker with fund protection, ensuring your capital stays safe while giving you quick and direct access to your profits\./g,
      'At UPFOREX, we prioritize fund protection while providing quick and direct access to your profits.',
    ],
  ],
};

export function publicBlogSlug(slug: string): string {
  return slug === 'trump-tarrif' ? 'trump-tariff' : slug;
}

export function cmsBlogSlug(slug: string): string {
  // The CMS still stores this article under its original slug.
  return slug === 'trump-tariff' ? 'trump-tarrif' : slug;
}

export function correctPublicBlogCopy<T extends PublicBlogCopy>(
  blog: T,
  requestedSlug = ''
): T {
  const slug = publicBlogSlug(blog.permaLink || requestedSlug);
  const corrected = { ...blog };

  for (const field of ['title', 'metaTitle', 'description', 'content', 'imageAltTag'] as const) {
    const original = blog[field];
    if (typeof original !== 'string') continue;

    // Match the observed text directly so CMS HTML, links and media stay intact.
    let text = original;
    for (const [pattern, replacement] of replacementsBySlug[slug] || []) {
      text = text.replace(pattern, replacement);
    }

    if (slug === '1-hour-forex-strategy-a-simple-guide-for-traders') {
      text = text.replace(/\b1 hour\b/gi, (match) => match.replace(' ', '-'));
    }

    corrected[field] = text;
  }

  if (slug === 'how-to-become-an-introducing-broker' && corrected.description) {
    corrected.description = corrected.description.replace(
      /explore an UpForex partner\.?$/,
      'explore a partnership with UPFOREX.'
    );
  }

  if (slug === 'trump-tariff' && corrected.description?.trim() === 'Test') {
    corrected.description = "Understand tariffs, reciprocal trade measures, and how Trump's tariff announcements affected US stocks, currencies, and global markets.";
  }

  if (blog.permaLink) corrected.permaLink = slug;
  return corrected;
}
