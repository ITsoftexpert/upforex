import { correctPublicBlogCopy } from './blog-copy-corrections';

describe('Audited CMS blog copy', () => {
  const examples = [
    ['strategy-snapshot-trading-breakouts', 'Lverage Low Liquidity for High Potential', 'Leverage Low Liquidity for High Potential'],
    ['best-regulated-forex-platform', 'accountable to the financial authorities..', 'accountable to the financial authorities.'],
    ['zero-commission-forex-trading', 'an edge in rapidly changing markets..', 'an edge in rapidly changing markets.'],
    ['best-forex-trading-platform', 'overnight financing surprises .', 'overnight financing surprises.'],
    ['best-forex-trading-platform', 'without commissions .', 'without commissions.'],
    ['forex-trading-in-dubai-laws-procedures-and-a-guide-for-beginners', 'takes place online using online platforms', 'takes place using online platforms'],
    ['forex-trading-with-instant-withdrawals', 'more than just a best forex trading platform', 'more than just the best forex trading platform'],
    ['how-to-start-forex-trading-for-beginners', 'paper trade on a lot of best forex trading platform.', 'paper trade on many of the best forex trading platforms.'],
    ['mt5-stock-trading-dubai-a-beneficial-guideline-for-uae-investors', 'with an user-friendly layout.', 'with a user-friendly layout.'],
    ['mt5-stock-trading-dubai-a-beneficial-guideline-for-uae-investors', 'a professional , yet simple method', 'a professional, yet simple method'],
    ['5-key-differences-between-forex-demo-and-real-account', '5 Crucial Difference Between Forex Demo and Real Account', '5 Crucial Differences Between Forex Demo and Real Accounts'],
    ['1-hour-forex-strategy-a-simple-guide-for-traders', 'Mastering the 1 Hour Forex Strategy; learn the 1 hour strategy.', 'Mastering the 1-Hour Forex Strategy; learn the 1-hour strategy.'],
    ['learn-how-to-trade-gold-online-techniques-and-insights', 'Learn how to trade gold online with strategies, and best practices.', 'Learn how to trade gold online with strategies and best practices.'],
  ];

  for (const [permaLink, original, expected] of examples) {
    it(`corrects the audited phrase: ${original}`, () => {
      const result = correctPublicBlogCopy({ permaLink, content: `<p>${original}</p>` });
      expect(result.content).toBe(`<p>${expected}</p>`);
      expect(correctPublicBlogCopy(result)).toEqual(result);
    });
  }

  it('repairs the two garbled EA sentences without damaging the linked HTML', () => {
    const original = {
      permaLink: 'how-to-use-mt5-expert-advisors-guide',
      content: '<p><span>An Expert Advisor runs inside the</span><a href="https://www.upforex.com/platforms/mt5"><span>MT5 platform</span></a><span>. It may identify sedes.</span></p><p><span>EA files are stored in </span><span>MQL5/Experts</span><span> and appear in Navigator after installation.tups, size positions, place orders, apply stop-loss and take-profit levels, or manage open tra</span></p>',
    };
    const result = correctPublicBlogCopy(original);
    expect(result.content).toContain('It may identify setups, size positions, place orders, apply stop-loss and take-profit levels, or manage open trades.</span>');
    expect(result.content).toContain('after installation.</span>');
    expect(result.content).toContain('<a href="https://www.upforex.com/platforms/mt5"><span>MT5 platform</span></a>');
    expect(result.content).not.toContain('sedes');
    expect(result.content).not.toContain('installation.tups');
    expect(original.content).toContain('identify sedes');
    expect(correctPublicBlogCopy(result)).toEqual(result);
  });

  it('repairs the garbled fund-protection description', () => {
    const description = 'At UpForex, we prioritize both forex broker with fund protection, ensuring your capital stays safe while giving you quick and direct access to your profits.';
    const result = correctPublicBlogCopy({
      permaLink: 'forex-broker-with-fund-protection',
      description,
      content: `<div><span>${description}</span></div>`,
    });
    expect(result.description).toBe('At UPFOREX, we prioritize fund protection while providing quick and direct access to your profits.');
    expect(result.content).toBe(`<div><span>${result.description}</span></div>`);
    expect(correctPublicBlogCopy(result)).toEqual(result);
  });

  it('completes the introducing-broker description', () => {
    const result = correctPublicBlogCopy({
      permaLink: 'how-to-become-an-introducing-broker',
      description: 'Learn how to become an introducing broker in 6 clear steps, understand variable commissions, compare IB roles, and explore an UpForex partner',
    });
    expect(result.description).toContain('explore a partnership with UPFOREX.');
    expect(correctPublicBlogCopy(result)).toEqual(result);
  });

  it('leaves unrelated posts, media, and corrected CMS descriptions unchanged', () => {
    const unrelated = { permaLink: 'unrelated-post', content: '<p>A 1 Hour chart</p>', imageUrl: '/1 Hour chart.png' };
    expect(correctPublicBlogCopy(unrelated)).toEqual(unrelated);

    const updated = { permaLink: 'trump-tarrif', description: 'An updated tariff description.', imageUrl: '/trump-tarrif.webp' };
    expect(correctPublicBlogCopy(updated)).toEqual({ ...updated, permaLink: 'trump-tariff' });
  });
});
