import { getBrowser, getRandomDelay, USER_AGENTS } from './browser';
import { loadSession, invalidateSession, updateLastUsed } from '../db/queries';

// ─── Parsers ────────────────────────────────────────────────────────────────

const parseKaloNumber = (txt: string): number => {
  if (!txt) return 0;
  const s = txt.replace(/R\$\s*/g, '').replace(/\s+/g, '').trim();
  if (/mi/i.test(s)) return parseFloat(s.replace(/mi/i, '').replace(',', '.')) * 1_000_000;
  if (/k/i.test(s))  return parseFloat(s.replace(/k/i, '').replace(',', '.')) * 1_000;
  return parseFloat(s.replace(',', '.').replace(/[^\d.]/g, '')) || 0;
};

// Valores dos cards de métrica são exibidos em milhares (k)
// Ex: "667,40" → 667.40 × 1000 = R$667.400
const parseMetricCard = (txt: string): number => {
  if (!txt) return 0;
  const val = parseFloat(txt.replace(',', '.'));
  return isNaN(val) ? 0 : val * 1000;
};

const parsePercent = (txt: string): number => {
  if (!txt) return 0;
  return parseFloat(txt.replace('%', '').replace(',', '.')) || 0;
};

// ─── Scrape ─────────────────────────────────────────────────────────────────

async function performScrape(productUrl: string) {
  const session = await loadSession();
  if (!session) throw new Error('SESSION_EXPIRED');

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1440, height: 900 }
  });

  await context.addCookies(session.cookies);
  const page = await context.newPage();

  try {
    console.log(JSON.stringify({ type: 'SCRAPE_GOTO', url: productUrl, timestamp: new Date().toISOString() }));
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 45000 });

    if (page.url().includes('/login')) {
      await invalidateSession(session.id);
      throw new Error('SESSION_EXPIRED');
    }

    // Aguarda os cards de métricas carregarem
    await page.waitForSelector('div.unit', { timeout: 15000 });
    await getRandomDelay(2000, 3000);

    console.log(JSON.stringify({ type: 'SCRAPE_PAGE_LOADED', timestamp: new Date().toISOString() }));

    const data = await page.evaluate(() => {
      // ── Helpers ──────────────────────────────────────────────────────────

      const getText = (sel: string, root: Element | Document = document): string =>
        root.querySelector(sel)?.textContent?.trim() || '';

      const getAll = (sel: string, root: Element | Document = document): Element[] =>
        Array.from(root.querySelectorAll(sel));

      // ── Produto ───────────────────────────────────────────────────────────

      const price = getText('div.kalo-bigtitle.font-bold');
      const rating = getText('span.text-base-666.leading-\\[24px\\].flex-shrink-0');
      const commissionRate = getText('span.text-base-666'); // "14%"

      // ── Cards de métricas ─────────────────────────────────────────────────
      // Os spans com valores numéricos dos cards seguem a classe:
      // "block whitespace-nowrap overflow-hidden text-ellipsis line-clamp-1"
      const metricSpans = getAll('span.block.whitespace-nowrap.overflow-hidden.text-ellipsis.line-clamp-1')
        .map(el => el.textContent?.trim() || '');

      // Ordem garantida pelo DOM (7d selecionado por padrão):
      // [0] revenue7d em k  → "667,40"
      // [1] sales7d em k    → "20,58"
      // [2] ? (terceira métrica)
      // [3] metric4
      // [4] metric5
      // [5] "0,00"
      // [6] creatorConversion → "25.34"
      // [7] affiliatesCount   → "26"

      const revenue7dRaw      = metricSpans[0] || '0';
      const sales7dRaw        = metricSpans[1] || '0';
      const creatorConversion = metricSpans[6] || '0';
      const affiliatesCount   = parseInt(metricSpans[7] || '0');

      // ── Totais acumulados ─────────────────────────────────────────────────
      const summarySpans = getAll('span.kalo-bigtitle.text-ellipsis.font-medium, span.kalo-title.font-medium')
        .map(el => el.textContent?.trim() || '');

      // [0] totalRevenue → "R$66,74 mi"
      // [1] creatorRevenue → "R$15,27 mi"
      // [2] affiliateRevenue → "R$51,47 mi"
      const totalRevenue     = summarySpans[0] || '0';
      const creatorRevenue   = summarySpans[1] || '0';
      const affiliateRevenue = summarySpans[2] || '0';

      // ── Tabela de influenciadores ─────────────────────────────────────────
      const influencers = getAll('.ant-table-tbody tr.ant-table-row').slice(0, 10).map(row => {
        const cells = getAll('td.ant-table-cell', row);
        const sortedCell = row.querySelector('td.ant-table-cell.ant-table-column-sort');
        const handleEl = row.querySelector('div.line-clamp-1');
        const followersEl = row.querySelector('div.text-base-999');

        return {
          handle: handleEl?.textContent?.trim() || null,
          followers: followersEl?.textContent?.replace('Seguidores', '').trim() || null,
          revenue: sortedCell?.textContent?.trim() || null,
          itemsSold: cells[1]?.textContent?.trim() || null,
          commission: cells[3]?.textContent?.trim() || null,
        };
      });

      return {
        raw: {
          price,
          rating,
          commissionRate,
          revenue7dRaw,
          sales7dRaw,
          creatorConversion,
          affiliatesCount,
          totalRevenue,
          creatorRevenue,
          affiliateRevenue,
          metricSpans, // debug — remover depois
        },
        influencers,
      };
    });

    // ── Parse final ────────────────────────────────────────────────────────

    const result = {
      price:             parseKaloNumber(data.raw.price),
      rating:            parseFloat(data.raw.rating.split('/')[0]) || 0,
      commissionRate:    parsePercent(data.raw.commissionRate),
      revenue7d:         parseMetricCard(data.raw.revenue7dRaw),
      sales7d:           parseMetricCard(data.raw.sales7dRaw),
      creatorConversion: parsePercent(data.raw.creatorConversion),
      affiliatesCount:   data.raw.affiliatesCount,
      totalRevenue:      parseKaloNumber(data.raw.totalRevenue),
      creatorRevenue:    parseKaloNumber(data.raw.creatorRevenue),
      affiliateRevenue:  parseKaloNumber(data.raw.affiliateRevenue),
      influencers:       data.influencers,
      _debug:            data.raw.metricSpans, // remover depois de validar
    };

    console.log(JSON.stringify({ type: 'SCRAPE_RESULT', result, timestamp: new Date().toISOString() }));

    await updateLastUsed(session.id);
    return result;

  } finally {
    await browser.close();
  }
}

// ─── Export com retry ────────────────────────────────────────────────────────

export async function scrapeProduct(productUrl: string, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(JSON.stringify({ type: 'RETRY_SCRAPE', attempt, url: productUrl, timestamp: new Date().toISOString() }));
        await new Promise(r => setTimeout(r, 3000));
      }
      return await performScrape(productUrl);
    } catch (error: any) {
      const isSessionExpired = error.message === 'SESSION_EXPIRED';
      const isTransient = error.message.includes('timeout') || error.message.includes('net::');

      console.error(JSON.stringify({
        type: 'SCRAPE_ATTEMPT_FAILED',
        attempt,
        error: error.message,
        isTransient,
        timestamp: new Date().toISOString()
      }));

      if (isSessionExpired || !isTransient || attempt === maxRetries) throw error;
    }
  }
}
