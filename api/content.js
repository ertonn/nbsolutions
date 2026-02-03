/**
 * Vercel serverless function: /api/content
 * Persists site content into Supabase `site_content` table using the service role key.
 * Expects POST with JSON body = content object.
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not configured' });
  }

  let payload = req.body;
  if (!payload || typeof payload !== 'object') {
    try { payload = JSON.parse(req.body); } catch(e) { payload = {}; }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const record = { key: 'site_content', value: payload, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('site_content').upsert(record, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/content error', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
};