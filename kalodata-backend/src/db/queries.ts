import { createClient } from '@supabase/supabase-js';
import { encrypt, decrypt } from '../services/encryption';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SECRET_KEY = process.env.ENCRYPTION_KEY!;

export async function saveSession(cookies: any[], expiresAt?: string) {
  const encrypted = encrypt(JSON.stringify(cookies), SECRET_KEY);
  
  // Invalida sessões anteriores
  await supabase
    .from('kalodata_sessions')
    .update({ is_valid: false })
    .eq('is_valid', true);

  const { data, error } = await supabase
    .from('kalodata_sessions')
    .insert({
      cookies_encrypted: encrypted,
      expires_at: expiresAt,
      is_valid: true
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadSession() {
  const { data, error } = await supabase
    .from('kalodata_sessions')
    .select('*')
    .eq('is_valid', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const cookies = JSON.parse(decrypt(data.cookies_encrypted, SECRET_KEY));
  return { ...data, cookies };
}

export async function invalidateSession(id: string) {
  await supabase
    .from('kalodata_sessions')
    .update({ is_valid: false })
    .eq('id', id);
}

export async function updateLastUsed(id: string) {
  await supabase
    .from('kalodata_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id);
}
