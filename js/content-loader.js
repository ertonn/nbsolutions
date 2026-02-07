
/* content-loader.js
   Loads content from Supabase (site_content table), with fallback to /api/content or /assets/misc/content.json
   Replaces elements that have data-content-key attributes and renders lists from data-content-list templates.
*/
(async function loadContent(){
  // --- Supabase config (public anon key only) ---
  const SUPABASE_URL = "https://krgiqtrwsievtizezqsg.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZ2lxdHJ3c2lldnRpemV6cXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDMwNzYsImV4cCI6MjA4NTY3OTA3Nn0.XnHkwwkJKshsVYDO9iWxZnnlEXYL9K_oHrnHtZy7EV0";
  let data = {};

  // Try to load from Supabase first
  let supabaseLoaded = false;
  try {
    if (window.supabase) {
      const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: row, error } = await supabaseClient.from('site_content').select('value').eq('key','site_content').single();
      if (!error && row && row.value) {
        data = row.value;
        supabaseLoaded = true;
        console.log('[content-loader] Loaded content from Supabase:', data);
      }
    }
  } catch (e) {
    // ignore, fallback below
  }

  // Fallback to API/JSON if Supabase not loaded
  if (!supabaseLoaded) {
    const sources = ['/api/content', '/assets/misc/content.json'];
    for (const src of sources) {
      try {
        const res = await fetch(src, { cache: 'no-store' });
        if (!res.ok) throw new Error('no');
        data = await res.json();
        break;
      } catch (e) {
        // try next source
      }
    }
    if (!data || Object.keys(data).length === 0) {
      // Check localStorage as last resort (for local development)
      const local = localStorage.getItem('nb_content_data');
      if (local) {
        try {
          data = JSON.parse(local);
          console.log('[content-loader] Loaded content from localStorage:', data);
        } catch (e) {
          console.warn('content-loader: failed to parse localStorage data');
        }
      } else {
        console.warn('content-loader: no content found from Supabase, API, local JSON, or localStorage.');
      }
    } else {
      console.log('[content-loader] Loaded content from fallback:', data);
    }
  }

  function applyContent(dataset) {
    document.querySelectorAll('[data-content-key]').forEach(el => {
      const key = el.dataset.contentKey;
      if (!key) return;
      if (dataset && Object.prototype.hasOwnProperty.call(dataset, key)) {
        if (el.dataset.contentType === 'html') el.innerHTML = dataset[key];
        else el.textContent = dataset[key];
      }
    });

    // Set href attributes for elements that expect URLs — allow absolute HTTP(S) links and site-local asset paths (e.g., /assets/... or assets/...)
    document.querySelectorAll('[data-content-href]').forEach(el => {
      const key = el.dataset.contentHref;
      if (!key) return;
      const val = dataset && dataset[key];
      const isRemote = val && /^https?:\/\//i.test(val);
      const isData = val && /^data:/i.test(val);
      const isRelative = val && (/^\//.test(val) || /^assets\//i.test(val) || /^[^:]+\/.*/.test(val));
      // Accept remote https, data: URIs, or relative/site-local paths so downloads work from assets during dev/deploy
      if (isRemote || isRelative || isData) {
        el.href = val;
        el.style.display = '';
        // always set safe rel attribute when opening in new tab
        try { el.setAttribute('rel', 'noopener noreferrer'); } catch(e){}

        // Provide a friendly download filename when possible.
        // Use explicit data-content-download if provided, otherwise derive filename for common doc types (pdf, docx, xls...)
        const downloadKey = el.dataset.contentDownload;
        if (downloadKey && dataset && dataset[downloadKey]) {
          el.setAttribute('download', dataset[downloadKey]);
        } else {
          try {
            const clean = String(val).split('?')[0].split('/').pop();
            if (clean && /\.(pdf|docx?|xlsx?)$/i.test(clean)) el.setAttribute('download', clean);
            // if it's a data: URL, attempt to derive a sensible filename
            if (isData && /data:application\/pdf/i.test(val)) el.setAttribute('download', 'brochure.pdf');
          } catch (e) { /* ignore */ }
        }

      } else {
        // Hide if no usable URL is available
        el.removeAttribute('href');
        el.style.display = 'none';
      }
    });

    document.querySelectorAll('[data-content-src]').forEach(el => {
      const key = el.dataset.contentSrc;
      if (!key) return;
      let val = dataset && dataset[key];
      if (!val) {
        const alt = key.replace(/\.image_path$/, '_file');
        if (dataset && dataset[alt]) val = dataset[alt];
      }
      if (val) { el.src = val; el.style.display = ''; } else { el.style.display = 'none'; }
    });

    // Ensure the Services hero background is updated when a services.hero.image is provided (handles cases where hero was defined in CSS)
    if (dataset && dataset['services.hero.image']) {
      try {
        const val = dataset['services.hero.image'];
        const hero = document.querySelector('.hero.hero-services');
        if (hero) {
          hero.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.5)), url('${val}')`;
        }
        const heroImgEl = document.getElementById('servicesHeroImage') || document.querySelector('.hero.hero-services .hero-bg');
        if (heroImgEl) { heroImgEl.src = val; heroImgEl.style.display = ''; }
      } catch(e){ /* ignore */ }
    }
  }

  function applyLists(dataset) {
    document.querySelectorAll('[data-content-list]').forEach(container => {
      const key = container.dataset.contentList;
      if (!key) return;
      const items = dataset && dataset[key];
      // find a template if provided
      const template = container.querySelector('template');
      // clear previous rendered items but keep template (we will not preserve template if we recreate)
      // We'll render from the template or fallback to simple markup
      if (!Array.isArray(items)) return;

      // remove all existing children (including template) and re-add template if it existed
      const templateHTML = template ? template.outerHTML : null;
      container.innerHTML = templateHTML || '';

      items.forEach(item => {
        if (template) {
          const clone = template.content.cloneNode(true);

          // if item is a string, populate the first text-capable element
          if (typeof item === 'string') {
            const textEl = clone.querySelector('*');
            if (textEl) textEl.textContent = item;
            container.appendChild(clone);
            return;
          }

          const img = clone.querySelector('img');
          if (img && item.icon) { img.src = item.icon; img.alt = item.iconAlt || ''; }
          const titleEl = clone.querySelector('.service-card-title');
          if (titleEl && item.title) titleEl.textContent = item.title;
          const listEl = clone.querySelector('.service-list');
          if (listEl) {
            listEl.innerHTML = '';
            if (Array.isArray(item.list)) {
              item.list.forEach(li => {
                const liEl = document.createElement('li');
                liEl.textContent = li;
                listEl.appendChild(liEl);
              });
            }
          }
          const link = clone.querySelector('.service-link');
          if (link && item.link) link.href = item.link;
          container.appendChild(clone);
        } else {
          // fallback: create a simple card or list item
          if (typeof item === 'string') {
            const li = document.createElement('li');
            li.textContent = item;
            container.appendChild(li);
            return;
          }

          const card = document.createElement('div');
          card.className = 'service-detail-card';
          card.innerHTML = `
            <div class="card-header">
              <div class="service-icon"><img src="${item.icon||''}" alt="${item.iconAlt||''}"></div>
              <h2 class="service-card-title">${item.title||''}</h2>
            </div>
            <ul class="service-list">${(Array.isArray(item.list) ? item.list.map(li=>`<li>${li}</li>`).join('') : '')}</ul>
            <div class="service-footer"><a href="${item.link||'#'}" class="service-link">View Portfolio Projects</a></div>
          `;
          container.appendChild(card);
        }
      });
    });
  }

  // apply once with loaded data
  applyContent(data);
  applyLists(data);

  // expose data globally for other scripts
  window.__siteContent = data;

  // expose a helper to allow hot updates (e.g., from admin page)
  window.__contentLoader = {
    update: (newData) => {
      // merge shallow
      data = Object.assign({}, data, newData);
      applyContent(data);
      applyLists(data);
      window.__siteContent = data; // update global
    },
    getAll: () => Object.assign({}, data)
  };
})();