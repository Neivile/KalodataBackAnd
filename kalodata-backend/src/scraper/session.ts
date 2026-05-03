import { getBrowser, getRandomDelay, USER_AGENTS } from './browser';
import { saveSession, loadSession, invalidateSession } from '../db/queries';

export async function captureNewSession(email: string, pass: string) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENTS[0],
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();

  try {
    console.log(JSON.stringify({ type: 'LOGIN_GOTO', url: 'https://www.kalodata.com/login', timestamp: new Date().toISOString() }));
    await page.goto('https://www.kalodata.com/login', { waitUntil: 'networkidle' });
    await getRandomDelay(1000, 2000);

    // Preenche email
    await page.fill('input[type="email"], input[placeholder*="email" i]', email);
    console.log(JSON.stringify({ type: 'LOGIN_FILLED_EMAIL', timestamp: new Date().toISOString() }));
    await getRandomDelay(500, 1500);

    // Preenche senha
    await page.fill('input[type="password"]', pass);
    console.log(JSON.stringify({ type: 'LOGIN_FILLED_PASSWORD', timestamp: new Date().toISOString() }));
    await getRandomDelay(800, 2000);

    // Clica no botão de submit
    await page.click('button[type="submit"]');
    console.log(JSON.stringify({ type: 'LOGIN_CLICKED_SUBMIT', timestamp: new Date().toISOString() }));

    // Aguarda sair da página de login (mais flexível que esperar URL específica)
    await page.waitForFunction(
      () => !window.location.href.includes('/login'),
      { timeout: 45000 }
    );

    const currentUrl = page.url();
    console.log(JSON.stringify({ type: 'LOGIN_REDIRECTED', url: currentUrl, timestamp: new Date().toISOString() }));

    await getRandomDelay(2000, 4000);

    const cookies = await context.cookies();
    console.log(JSON.stringify({ type: 'LOGIN_COOKIES_CAPTURED', count: cookies.length, timestamp: new Date().toISOString() }));

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await saveSession(cookies, expiresAt);
    console.log(JSON.stringify({ type: 'LOGIN_SESSION_SAVED', timestamp: new Date().toISOString() }));

    return { success: true };
  } catch (error: any) {
    console.error(JSON.stringify({ type: 'LOGIN_ERROR', error: error.message, timestamp: new Date().toISOString() }));
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

export async function validateCurrentSession(retryCount = 1): Promise<boolean> {
  const session = await loadSession();
  if (!session) return false;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    const browser = await getBrowser();
    const context = await browser.newContext();
    await context.addCookies(session.cookies);
    const page = await context.newPage();

    try {
      if (attempt > 0) {
        console.log(JSON.stringify({ type: 'RETRY_SESSION_VALIDATION', attempt, timestamp: new Date().toISOString() }));
        await new Promise(r => setTimeout(r, 3000));
      }

      await page.goto('https://www.kalodata.com/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
      const isLoginPage = page.url().includes('/login');

      if (isLoginPage) {
        console.log(JSON.stringify({ type: 'SESSION_EXPIRED_DETECTED', id: session.id, timestamp: new Date().toISOString() }));
        await invalidateSession(session.id);
        return false;
      }

      return true;
    } catch (error: any) {
      const isNetworkError = error.message.includes('timeout') || error.message.includes('net::') || error.message.includes('navigation');

      console.error(JSON.stringify({
        type: 'VALIDATION_ATTEMPT_FAILED',
        attempt,
        error: error.message,
        isNetworkError,
        timestamp: new Date().toISOString()
      }));

      if (!isNetworkError || attempt === retryCount) {
        return false;
      }
    } finally {
      await browser.close();
    }
  }

  return false;
}
