import { getBrowser, getRandomDelay, USER_AGENTS } from './browser';
import { loadSession, invalidateSession, updateLastUsed } from '../db/queries';

async function performScrape(productUrl: string) {
  const session = await loadSession();
  if (!session) throw new Error('SESSION_EXPIRED');

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
  });
  
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 45000 });
    
    if (page.url().includes('/login')) {
      await invalidateSession(session.id);
      throw new Error('SESSION_EXPIRED');
    }

    await getRandomDelay(3000, 6000);

    // Seletores (Exemplos baseados na spec)
    const data = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '0';
      const parsePrice = (txt: string) => parseFloat(txt.replace(/[^\d,.]/g, '').replace(',', '.'));

      return {
        revenue7d: parsePrice(getText('.revenue-7d-selector')),
        revenue30d: parsePrice(getText('.revenue-30d-selector')),
        sales7d: parseInt(getText('.sales-7d-selector')),
        sales30d: parseInt(getText('.sales-30d-selector')),
        affiliatesCount: parseInt(getText('.affiliates-selector')),
        trend: document.querySelector('.trend-up') ? 'up' : 'down',
        influencers: Array.from(document.querySelectorAll('.influencer-row')).slice(0, 3).map(el => ({
          handle: el.querySelector('.handle')?.textContent?.trim(),
          followers: el.querySelector('.followers')?.textContent?.trim(),
          revenue: parseFloat(el.querySelector('.revenue')?.textContent?.replace(/[^\d,.]/g, '') || '0'),
          itemsSold: parseInt(el.querySelector('.sold')?.textContent || '0'),
          videoUrl: (el.querySelector('a.video-link') as HTMLAnchorElement)?.href,
          thumbnailUrl: (el.querySelector('img.thumb') as HTMLImageElement)?.src
        }))
      };
    });

    await updateLastUsed(session.id);
    return data;
  } finally {
    await browser.close();
  }
}

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
      const isTransientError = error.message.includes('timeout') || error.message.includes('net::');

      console.error(JSON.stringify({ 
        type: 'SCRAPE_ATTEMPT_FAILED', 
        attempt, 
        error: error.message, 
        isTransientError,
        timestamp: new Date().toISOString() 
      }));

      // Não faz retry se a sessão expirou ou se não for um erro transitório
      if (isSessionExpired || !isTransientError || attempt === maxRetries) {
        throw error;
      }
    }
  }
}
