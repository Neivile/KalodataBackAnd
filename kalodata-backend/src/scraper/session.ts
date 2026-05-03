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
    await page.goto('https://www.kalodata.com/login', { waitUntil: 'networkidle' });
    await getRandomDelay(1000, 2000);
    
    // Login
    await page.fill('input[type="email"], input[placeholder*="email" i]', email);
    await getRandomDelay(500, 1500);
    await page.fill('input[type="password"]', pass);
    await getRandomDelay(800, 2000);
    
    await [page.click](http://page.click)('button[type="submit"]');
    
    // Aguarda sucesso (redirecionamento ou elemento de dashboard)
    await page.waitForURL(url => url.href.includes('/dashboard') || url.href.includes('/home'), { timeout: 30000 });
    await getRandomDelay(2000, 4000);
    
    const cookies = await context.cookies();
    const expiresAt = new Date([Date.now](http://Date.now)() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    await saveSession(cookies, expiresAt);
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
        // Sessão expirada é definitivo
        console.log(JSON.stringify({ type: 'SESSION_EXPIRED_DETECTED', id: [session.id](http://session.id), timestamp: new Date().toISOString() }));
        await invalidateSession([session.id](http://session.id));
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
        // Se não for erro de rede ou acabaram as tentativas, não invalidamos a sessão ainda se for rede,
        // mas retornamos false para o scraper saber que não pode prosseguir agora.
        return false;
      }
    } finally {
      await browser.close();
    }
  }
  return false;
}
