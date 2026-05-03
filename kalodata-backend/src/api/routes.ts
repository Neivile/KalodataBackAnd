import { Router } from 'express';
import { scraperLimiter } from './middleware';
import { captureNewSession, validateCurrentSession } from '../scraper/session';
import { scrapeProduct } from '../scraper/kalodata';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

router.get('/session/status', async (req, res) => {
  try {
    const { data } = await supabase
      .from('kalodata_sessions')
      .select('*')
      .eq('is_valid', true)
      .maybeSingle();

    if (!data) {
      console.log(JSON.stringify({ type: 'SESSION_CHECK', status: 'NOT_FOUND', timestamp: new Date().toISOString() }));
      return res.json({ isValid: false });
    }

    const capturedAt = new Date(data.captured_at);
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    const daysRemaining = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    console.log(JSON.stringify({
      type: 'SESSION_CHECK',
      status: 'VALID',
      daysRemaining,
      timestamp: new Date().toISOString()
    }));

    res.json({
      isValid: true,
      capturedAt: data.captured_at,
      expiresAt: data.expires_at,
      daysRemaining
    });
  } catch (error: any) {
    console.error(JSON.stringify({ type: 'SESSION_ERROR', error: error.message, stack: error.stack }));
    res.status(500).json({ isValid: false, error: error.message });
  }
});

router.post('/session/login', async (req, res) => {
  const { email } = req.body;
  console.log(JSON.stringify({ type: 'LOGIN_ATTEMPT', user: email, timestamp: new Date().toISOString() }));

  try {
    const result = await captureNewSession(email, req.body.password);
    if (result.success) {
      console.log(JSON.stringify({ type: 'LOGIN_SUCCESS', user: email, timestamp: new Date().toISOString() }));
      res.json({ success: true });
    } else {
      console.error(JSON.stringify({ type: 'LOGIN_FAILED', user: email, error: result.error, timestamp: new Date().toISOString() }));
      res.status(401).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error(JSON.stringify({ type: 'LOGIN_CRASH', user: email, error: error.message, stack: error.stack }));
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/session/validate', async (req, res) => {
  try {
    const isValid = await validateCurrentSession();
    console.log(JSON.stringify({ type: 'SESSION_VALIDATION', isValid, timestamp: new Date().toISOString() }));
    res.json({ isValid });
  } catch (error: any) {
    console.error(JSON.stringify({ type: 'VALIDATION_ERROR', error: error.message }));
    res.json({ isValid: false, error: error.message });
  }
});

router.post('/scrape/product', scraperLimiter, async (req, res) => {
  const { url } = req.body;
  console.log(JSON.stringify({ type: 'SCRAPE_START', url, timestamp: new Date().toISOString() }));

  try {
    const data = await scrapeProduct(url);
    console.log(JSON.stringify({ type: 'SCRAPE_SUCCESS', url, timestamp: new Date().toISOString() }));
    res.json({ success: true, data });
  } catch (error: any) {
    const isSessionError = error.message === 'SESSION_EXPIRED';
    console.error(JSON.stringify({
      type: 'SCRAPE_FAILED',
      url,
      error: error.message,
      isSessionError,
      timestamp: new Date().toISOString()
    }));

    if (isSessionError) {
      res.status(401).json({
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Sessão expirada. Acesse Configurações para renovar.',
        fallback: true
      });
    } else {
      res.status(500).json({ success: false, error: 'SCRAPE_FAILED', message: error.message });
    }
  }
});

// ─── DEBUG: testa gravação Railway → Supabase ────────────────────────────────
router.get('/debug/test-save', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kalodata_sessions')
      .insert({
        cookies_encrypted: 'TEST_COOKIE_DATA',
        captured_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        is_valid: false,
        last_used_at: new Date().toISOString(),
      })
      .select()

    if (error) {
      console.error(JSON.stringify({ type: 'DEBUG_SAVE_ERROR', error: error.message, details: error }));
      return res.status(500).json({ success: false, error: error.message, details: error });
    }

    console.log(JSON.stringify({ type: 'DEBUG_SAVE_SUCCESS', data }));
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error(JSON.stringify({ type: 'DEBUG_SAVE_CRASH', error: err.message }));
    return res.status(500).json({ success: false, error: err.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

export default router;
