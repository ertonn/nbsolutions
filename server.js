require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // allow large base64 images
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const BUCKET = process.env.SUPABASE_BUCKET || 'storage';

let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.info('Supabase admin client initialized');
} else {
  console.warn('Supabase service role key not configured — falling back to local file storage for admin API');
}

function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-pass'] || req.headers['authorization'] && (req.headers['authorization'].split(' ')[1]);
  if (!pass || pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Projects endpoints
app.get('/api/projects', async (req, res) => {
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('projects').select('*').order('id', { ascending: false });
      if (error) throw error;
      return res.json(data || []);
    }
    // fallback: read local JSON
    const p = path.join(__dirname, 'js', 'projects-data.json');
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      return res.json(d);
    }
    return res.json([]);
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

app.get('/api/projects/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('projects').select('*').eq('id', id).single();
      if (error) throw error;
      return res.json(data);
    }
    const p = path.join(__dirname, 'js', 'projects-data.json');
    const d = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : [];
    const item = d.find(x => x.id === id);
    return res.json(item || null);
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

app.post('/api/projects', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    // handle imageBase64 if present: write to assets folder
    let imagePath = payload.image || '';
    if (payload.imageBase64 && payload.imageFilename) {
      const filename = `${Date.now()}-${payload.imageFilename.replace(/[^a-z0-9.\-]/gi,'_')}`;
      const outDir = path.join(__dirname, 'assets', 'images', 'different categories', 'projects');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, filename);
      const data = payload.imageBase64.split(',').pop();
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      imagePath = `assets/images/different categories/projects/${filename}`;
    }

    if (supabaseAdmin) {
      // if payload.id present -> update
      if (payload.id) {
        const { data, error } = await supabaseAdmin.from('projects').update(Object.assign({}, payload, { image: imagePath })).eq('id', payload.id).select().single();
        if (error) throw error;
        return res.json(data);
      } else {
        const toInsert = Object.assign({}, payload, { image: imagePath });
        delete toInsert.id;
        const { data, error } = await supabaseAdmin.from('projects').insert(toInsert).select().single();
        if (error) throw error;
        return res.json(data);
      }
    }

    // fallback: update local JSON file
    const p = path.join(__dirname, 'js', 'projects-data.json');
    const arr = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : [];
    if (payload.id) {
      const idx = arr.findIndex(x => x.id === payload.id);
      if (idx !== -1) {
        arr[idx] = Object.assign({}, arr[idx], payload, { image: imagePath });
        fs.writeFileSync(p, JSON.stringify(arr, null, 2));
        return res.json(arr[idx]);
      } else {
        return res.status(404).json({ error: 'Not found' });
      }
    } else {
      const id = Date.now();
      const newObj = Object.assign({}, payload, { id, image: imagePath });
      arr.push(newObj);
      fs.writeFileSync(p, JSON.stringify(arr, null, 2));
      return res.json(newObj);
    }

  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

app.put('/api/projects/:id', requireAdmin, async (req, res) => {
  req.body.id = parseInt(req.params.id);
  return app._router.handle(req, res, (err) => {}); // delegate to POST logic for simplicity
});

app.delete('/api/projects/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.from('projects').delete().eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    }
    const p = path.join(__dirname, 'js', 'projects-data.json');
    const arr = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,'utf8')) : [];
    const newArr = arr.filter(x => x.id !== id);
    fs.writeFileSync(p, JSON.stringify(newArr, null, 2));
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

// Content endpoints (site_content)
app.get('/api/content', async (req, res) => {
  try {
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('site_content').select('value').eq('key','site_content').single();
      if (error) throw error;
      return res.json(data ? data.value : {});
    }
    const p = path.join(__dirname, 'assets', 'misc', 'content.json');
    if (fs.existsSync(p)) {
      const content = JSON.parse(fs.readFileSync(p,'utf8'));
      return res.json(content);
    }
    return res.json({});
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

app.post('/api/content', requireAdmin, async (req, res) => {
  try {
    const value = req.body || {};
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('site_content').upsert({ key: 'site_content', value }).select().single();
      if (error) throw error;
      return res.json(data);
    }
    const p = path.join(__dirname, 'assets', 'misc', 'content.json');
    fs.writeFileSync(p, JSON.stringify(value, null, 2));
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message || e }); }
});

app.listen(PORT, () => console.log(`Admin API listening on http://localhost:${PORT}`));
