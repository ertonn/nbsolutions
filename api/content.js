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

    // Handle possible embedded brochure base64 fields: brochure1_file, brochure1_file_name, brochure2_file, brochure2_file_name
    async function handleEmbeddedBrochure(keyBase) {
      const fileKey = `${keyBase}_file`;
      const nameKey = `${keyBase}_file_name`;
      if (payload[fileKey] && payload[nameKey]) {
        try {
          const b64 = ('' + payload[fileKey]).replace(/^data:.*;base64,/, '');
          const buffer = Buffer.from(b64, 'base64');
          const origName = payload[nameKey] ? String(payload[nameKey]) : `${keyBase}.pdf`;
          const safeName = origName.replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `brochures/${Date.now()}_${safeName}`;
          const bucket = 'site-assets';

          const { data: uploadData, error: uploadError } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: 'application/pdf', upsert: true });
          if (uploadError) { console.error('Supabase storage upload error', uploadError); return; }

          const { data: publicData, error: publicError } = await supabase.storage.from(bucket).getPublicUrl(path);
          if (publicError) { console.error('getPublicUrl error', publicError); return; }
          const publicUrl = (publicData && (publicData.publicUrl || publicData.data && publicData.data.publicUrl)) ? (publicData.publicUrl || (publicData.data && publicData.data.publicUrl)) : null;
          if (publicUrl) {
            payload[`${keyBase}.pdf_path`] = publicUrl;
          }
        } catch (e) { console.error('handleEmbeddedBrochure error', e); }
        finally { delete payload[fileKey]; delete payload[nameKey]; }
      }
    }

    await handleEmbeddedBrochure('brochure1');
    await handleEmbeddedBrochure('brochure2');

    const record = { key: 'site_content', value: payload, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('site_content').upsert(record, { onConflict: 'key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/content error', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
};