// Supabase client (initialized at DOMContentLoaded)
let supabaseClient = null;
let ADMIN_PASSWORD = localStorage.getItem('nb_admin_pass') || 'admin'; // kept for fallback
const STORAGE_KEY = "nb_projects_data";

// Canonical project categories (fixed set)
const PROJECT_CATEGORIES = [
    "Water Supply & Hydraulics",
    "Transport & Railways",
    "BIM & Engineering Support",
    "Roads & Structures",
    "Buildings & Special Projects"
];

// Storage bucket (public bucket you created)
const STORAGE_BUCKET = 'storage';

// Gallery upload limits
const GALLERY_MAX_FILES = 10;
const GALLERY_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Temp state for gallery files while editing a project
let __projectGalleryFiles = []; // newly selected File objects
let __projectExistingGallery = []; // existing URLs from project.gallery
let __projectRemovedGallery = []; // URLs removed by admin during edit

document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    if (localStorage.getItem('admin_logged_in') === 'true') {
        showDashboard();
    }
    syncWithJSON(); // Ensure local storage has initial data
    // if supabase is configured, check auth and sync
    if (supabaseClient) checkAuthState();
});

function checkPassword() {
    const pass = document.getElementById('adminPassword').value;
    const error = document.getElementById('loginError');

    if (pass === ADMIN_PASSWORD) {
        localStorage.setItem('admin_logged_in', 'true');
        showDashboard();
        error.style.display = 'none';
    } else {
        error.style.display = 'block';
    }
}

function logout() {
    localStorage.removeItem('admin_logged_in');
    location.reload();
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    // initialize interactive UI (sidebar, filters, etc.)
    initAdminUI();
    showSection('dashboard-section');
    renderAdminProjects();
    renderServicesAdmin();
    renderContentManager();
    renderBrochuresAdmin();
    updateDashboardCounts();
}

function showSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(sectionId);
    if (el) el.classList.add('active');

    // Only show the main projects area for Projects section
    const projectsArea = document.getElementById('projectsArea');
    if (projectsArea) {
        if (sectionId === 'projects-section') {
            projectsArea.style.display = 'block';
            // Reset filters when switching to projects
            const search = document.getElementById('projectSearch');
            const category = document.getElementById('projectFilterCategory');
            if (search) search.value = '';
            if (category) category.value = '';
            renderAdminProjects(); // ensure it's up-to-date
        } else {
            projectsArea.style.display = 'none';
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initAdminUI() {
    // Sidebar links
    document.querySelectorAll('.sidebar .nav-link').forEach(el => {
        el.addEventListener('click', function(e){
            // handle logout shortcut first
            if (this.id === 'sidebarLogout') { e.preventDefault(); logout(); return; }

            const section = this.getAttribute('data-section');
            // If the link has a data-section attribute we handle it via SPA behavior
            if (section) {
                e.preventDefault();
                document.querySelectorAll('.sidebar .nav-link').forEach(a => a.classList.remove('active'));
                this.classList.add('active');
                showSection(section);
            }
            // Otherwise allow normal link navigation (for example the Preview Site which opens index.html)
        });
    });

    // logout shortcut
    const logoutBtn = document.getElementById('sidebarLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', function(e){ e.preventDefault(); logout(); });

    // project filters
    const search = document.getElementById('projectSearch');
    const category = document.getElementById('projectFilterCategory');
    const status = document.getElementById('projectFilterStatus');

    if (category) {
        // populate categories with canonical list first, then include any project categories not in the canonical set
        const projectCats = Array.from(new Set(getProjects().map(p => p.category))).filter(Boolean);
        const combined = PROJECT_CATEGORIES.concat(projectCats.filter(c => !PROJECT_CATEGORIES.includes(c)));
        category.innerHTML = '<option value="">All Categories</option>' + combined.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Ensure the project form's category select uses the canonical list
    const projectCategorySelect = document.getElementById('projectCategory');
    if (projectCategorySelect) {
        const opts = PROJECT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
        projectCategorySelect.innerHTML = opts;
    }

    if (search) search.addEventListener('input', renderAdminProjects);
    if (category) category.addEventListener('change', renderAdminProjects);

    // close modal on backdrop click (clear temp previews when closing)
    document.querySelectorAll('.modal-backdrop').forEach(m => {
        m.addEventListener('click', function(e){
            if (e.target === m) {
                m.classList.remove('active');
                m.setAttribute('aria-hidden','true');
                // clear any temp preview data
                const img = document.getElementById('projectImagePreview'); if (img) { delete img.dataset.temp; img.src = 'assets/images/icons/placeholder.svg'; }
                const sicon = document.getElementById('serviceIconPreview'); if (sicon && !sicon.src.includes('data:')) { /* keep existing */ } else if (sicon) { sicon.src = ''; sicon.style.display = 'none'; }
            }
        });
    });

    // Services hero image preview handler
    const srvImgInput = document.getElementById('content_services_hero_image');
    const srvImgPreview = document.getElementById('content_services_hero_image_preview');
    if (srvImgInput && srvImgPreview) {
        srvImgInput.addEventListener('change', function(e){
            const f = srvImgInput.files[0];
            if (f) {
                const reader = new FileReader();
                reader.onload = function(ev){ srvImgPreview.src = ev.target.result; srvImgPreview.style.display = ''; };
                reader.readAsDataURL(f);
            } else { srvImgPreview.src = ''; srvImgPreview.style.display = 'none'; }
        });
    }

    // close modals with Escape (clear temp previews)
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { document.querySelectorAll('.modal-backdrop.active').forEach(m => { m.classList.remove('active'); m.setAttribute('aria-hidden','true'); }); const img = document.getElementById('projectImagePreview'); if (img) { delete img.dataset.temp; img.src = 'assets/images/icons/placeholder.svg'; } } });
} 

function changePassword() {
    const p = document.getElementById('settings_admin_password').value.trim();
    if (!p) { alert('Enter a new password'); return; }
    localStorage.setItem('nb_admin_pass', p);
    ADMIN_PASSWORD = p;
    alert('Password updated (local only).');
    document.getElementById('settings_admin_password').value = '';
}



// ---------------- Supabase auth & sync ----------------
function initSupabase() {
    try {
        // Hardcoded Supabase config for static site
        const url = "https://krgiqtrwsievtizezqsg.supabase.co";
        const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZ2lxdHJ3c2lldnRpemV6cXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDMwNzYsImV4cCI6MjA4NTY3OTA3Nn0.XnHkwwkJKshsVYDO9iWxZnnlEXYL9K_oHrnHtZy7EV0";

        if (!url || !key) {
            console.warn('Supabase keys not found — please provide your Supabase URL and anon key.');
            supabaseClient = null; return;
        }

        // Make sure to include the Supabase CDN in your HTML:
        // <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        supabaseClient = supabase.createClient(url, key);
        console.info('Supabase initialized for', url);

        // listen to auth changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) onSignedIn(session.user);
            else {
                const signedInAs = document.getElementById('signedInAs');
                if (signedInAs) signedInAs.textContent = '';
                const signOutBtn = document.getElementById('supabaseSignOutBtn');
                if (signOutBtn) signOutBtn.style.display = 'none';
            }
        });
    } catch (e) { console.error('initSupabase error', e); }
}

async function checkAuthState() {
    if (!supabaseClient) return;
    try {
        const { data } = await supabaseClient.auth.getSession();
        if (data && data.session && data.session.user) {
            onSignedIn(data.session.user);
        }
    } catch (e) { console.error('checkAuthState', e); }
}

async function supabaseSignIn() {
    if (!supabaseClient) {
        const loginError = document.getElementById('loginError');
        if (loginError) {
            loginError.textContent = 'Supabase not configured';
            loginError.style.display = 'block';
        }
        return;
    }
    const email = document.getElementById('adminEmail').value.trim();
    const pass = document.getElementById('adminPassword').value;
    try {
        const res = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if (res.error) throw res.error;
        if (res.data && res.data.user) {
            localStorage.setItem('admin_logged_in', 'true');
            onSignedIn(res.data.user);
            showDashboard();
            document.getElementById('loginError').style.display = 'none';
        }
    } catch (e) {
        const loginError = document.getElementById('loginError');
        if (loginError) loginError.textContent = e.message || 'Sign-in failed';
        document.getElementById('loginError').style.display = 'block';
    }
}

async function supabaseSignOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    localStorage.removeItem('admin_logged_in');
    const signedInAs = document.getElementById('signedInAs');
    if (signedInAs) signedInAs.textContent = '';
    document.getElementById('supabaseSignOutBtn').style.display = 'none';
    location.reload();
}

async function onSignedIn(user) {
    const email = user.email || (user.user_metadata && user.user_metadata.email) || '';
    const el = document.getElementById('signedInAs');
    if (el) el.textContent = 'Signed in as ' + email;
    const outBtn = document.getElementById('supabaseSignOutBtn'); if (outBtn) outBtn.style.display = 'inline-block';

    // fetch remote content
    try {
        const remoteContent = await fetchContentRemote();
        if (remoteContent) { window.__adminContent = Object.assign({}, remoteContent, window.__adminContent || {}); renderContentManager(); if (window.__contentLoader) window.__contentLoader.update(window.__adminContent); }
        renderAdminProjects(); renderServicesAdmin(); updateDashboardCounts();
    } catch (e) { console.error('onSignedIn sync error', e); }
}

function updateDashboardCounts() {
    const projects = getProjects();
    const services = (window.__adminContent && window.__adminContent['services.cards']) || [];
    const pc = document.getElementById('dashboardProjectsCount');
    const sc = document.getElementById('dashboardServicesCount');
    if (pc) pc.textContent = projects.length;
    if (sc) sc.textContent = services.length;
} 

function syncWithJSON() {
    if (!localStorage.getItem(STORAGE_KEY)) {
        fetch('js/projects-data.json')
            .then(res => res.json())
            .then(data => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                if (localStorage.getItem('admin_logged_in') === 'true') {
                    renderAdminProjects();
                }
            })
            .catch(err => console.error("Could not sync with local JSON:", err));
    }
}

function getProjects() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveProjects(projects) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
        console.warn('localStorage quota exceeded, skipping local save:', e);
    }
}

function toggleProjectForm(isEdit = false) {
    const modal = document.getElementById('projectModal');
    const actualForm = document.getElementById('actualForm');
    const imgPreview = document.getElementById('projectImagePreview');

    if (modal.classList.contains('active') && !isEdit) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden','true');
        actualForm.reset();
        document.getElementById('editId').value = '';
        document.getElementById('projectImagePath').value = '';
        if (imgPreview) { delete imgPreview.dataset.temp; imgPreview.src = 'assets/images/icons/placeholder.svg'; }
        // clear gallery state when closing
        __projectGalleryFiles = [];
        __projectExistingGallery = [];
        __projectRemovedGallery = [];
        renderProjectGalleryPreview();
    } else {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden','false');
        if (!isEdit) {
            const formTitle = document.getElementById('formTitle');
            if (formTitle) formTitle.textContent = "Add New Project";
            actualForm.reset();
            document.getElementById('editId').value = '';
            document.getElementById('projectImagePath').value = '';
            document.getElementById('projectImage').setAttribute('required', 'required');
            setTimeout(() => document.getElementById('projectTitle').focus(), 50);
            // ensure preview starts fresh
            if (imgPreview) { delete imgPreview.dataset.temp; imgPreview.src = 'assets/images/icons/placeholder.svg'; }
            // clear any gallery previews
            __projectGalleryFiles = [];
            __projectExistingGallery = [];
            __projectRemovedGallery = [];
            renderProjectGalleryPreview();
            updateProjectPreview();
            // ensure WYSIWYG toolbar reflects the editor state
            setTimeout(()=>{ updateWysiwygToolbarState(); }, 60);
        } else {
            // editing existing: remove required from image input since it may already exist
            document.getElementById('projectImage').removeAttribute('required');
            setTimeout(() => document.getElementById('projectTitle').focus(), 50);
            updateProjectPreview();
            setTimeout(()=>{ updateWysiwygToolbarState(); }, 60);
        }
    }
} 

async function renderAdminProjects() {
    let projects = [];
    if (supabaseClient) {
        const remote = await fetchProjectsRemote();
        projects = remote && Array.isArray(remote) ? remote : [];
    } else {
        projects = getProjects();
    }

    const list = document.getElementById('adminProjectList');
    list.innerHTML = '';

    const search = document.getElementById('projectSearch')?.value.toLowerCase() || '';
    const cat = document.getElementById('projectFilterCategory')?.value || '';

    // filter projects
    const filtered = projects.filter(p => {
        if (search && !(p.title.toLowerCase().includes(search))) return false;
        if (cat && p.category !== cat) return false;
        return true;
    });

    // keep category filter up-to-date
    const catSel = document.getElementById('projectFilterCategory');
    if (catSel) {
        const cats = Array.from(new Set(projects.map(p=>p.category))).filter(Boolean);
        const cur = catSel.value;
        catSel.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
        if (cur) catSel.value = cur;
    }

    filtered.forEach(project => {
        const item = document.createElement('div');
        item.className = 'admin-project-item';
        // try to render preview image (remote URL or base64 stored locally)
        const filename = project.image ? project.image.split('/').pop() : '';
        const preview = filename ? (localStorage.getItem('img_' + filename) || project.image) : project.image || 'assets/images/icons/placeholder.svg';
        item.innerHTML = `
            <div style="display:flex; gap:12px; align-items:center;">
                <img src="${preview || 'assets/images/icons/placeholder.svg'}" alt="" style="height:64px;width:64px;object-fit:cover;border-radius:8px;">
                <div class="admin-project-info">
                    <h3>${project.title}</h3>
                    <p>${project.category}</p>
                </div>
            </div>
            <div class="admin-actions">
                <button onclick="editProject(${project.id})" class="cta-button btn-edit">EDIT</button>
                <button onclick="deleteProject(${project.id})" class="cta-button btn-delete">DELETE</button>
            </div>
        `;
        list.appendChild(item);
    });

    // update dashboard count
    const dashCount = document.getElementById('dashboardProjectsCount');
    if (dashCount) dashCount.textContent = projects.length;
} 

// Convert plain text description to HTML with formatting
function formatDescription(text) {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '<p>';
    let inList = false;
    let listType = null;

    lines.forEach((line, index) => {
        line = line.trim();

        if (!line) {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            if (index < lines.length - 1) {
                html += '</p><p>';
            }
            return;
        }

        // Check for bullet points
        if (line.startsWith('- ')) {
            if (!inList) {
                html += '</p><ul>';
                inList = true;
                listType = 'ul';
            } else if (listType !== 'ul') {
                html += '</ol><ul>';
                listType = 'ul';
            }
            html += `<li>${line.substring(2)}</li>`;
        }
        // Check for numbered lists
        else if (/^\d+\.\s/.test(line)) {
            if (!inList) {
                html += '</p><ol>';
                inList = true;
                listType = 'ol';
            } else if (listType !== 'ol') {
                html += '</ul><ol>';
                listType = 'ol';
            }
            html += `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
        }
        // Regular text
        else {
            if (inList) {
                html += listType === 'ul' ? '</ul><p>' : '</ol><p>';
                inList = false;
                listType = null;
            }
            html += line + '<br>';
        }
    });

    if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
    }
    html += '</p>';

    // Clean up empty paragraphs and extra breaks
    html = html.replace(/<p><\/p>/g, '').replace(/<p><br>/g, '<p>').replace(/<br><\/p>/g, '</p>');

    return html;
}

// Handle image upload
async function handleImageUpload(fileInput) {
    const file = fileInput.files[0];
    if (!file) return null;

    // Create a sanitized filename
    const timestamp = Date.now();
    const sanitizedName = file.name.toLowerCase().replace(/[^a-z0-9.]/g, '-');

    // Prefer uploading to Supabase Storage (if available), otherwise fall back to base64 local storage
    const filename = `${timestamp}-${sanitizedName}`;
    if (supabaseClient) {
        try {
            const remotePath = `projects/images/${timestamp}-${sanitizedName}`;
            const { data: uploadData, error: uploadError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(remotePath, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: publicData, error: publicErr } = await supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(remotePath);
            if (publicErr) throw publicErr;
            if (publicData && publicData.publicUrl) return publicData.publicUrl;
            if (publicData && publicData.data && publicData.data.publicUrl) return publicData.data.publicUrl;
        } catch (e) {
            console.warn('Supabase storage upload failed, falling back to base64 storage', e);
        }
    }

    // Fallback: convert to base64 and store temporarily
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try { localStorage.setItem('img_' + filename, e.target.result); } catch (err) { console.warn('Could not store image locally', err); }
            resolve(relativePath);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;

    // Determine whether we can upload directly from client (anon key) or should use server API as fallback
    const useClientStorage = !!supabaseClient;

    // Handle image file (if user selected a new file)
    const imageInput = document.getElementById('projectImage');
    const fileBlob = (imageInput && imageInput.files && imageInput.files[0]) ? imageInput.files[0] : null;

    // Handle description (WYSIWYG or plain)
    const descEl = document.getElementById('projectDescription');
    let formattedDescription = '';
    let plainDescription = '';

    if (descEl && descEl.getAttribute && descEl.getAttribute('contenteditable') === 'true') {
        formattedDescription = descEl.innerHTML.trim();
        plainDescription = descEl.innerText.trim();
    } else {
        plainDescription = (descEl && descEl.value) ? descEl.value : '';
        formattedDescription = formatDescription(plainDescription);
    }

    const payload = {
        id: id ? parseInt(id) : null,
        title: document.getElementById('projectTitle').value,
        category: document.getElementById('projectCategory').value,
        description: formattedDescription,
        plain_description: plainDescription,
        video: (document.getElementById('projectVideoLink') && document.getElementById('projectVideoLink').value) ? document.getElementById('projectVideoLink').value.trim() : ''
    };

    try {
        // If a new cover image file was selected, upload it to storage (preferred) or send base64 to server
        if (fileBlob) {
            if (useClientStorage) {
                const uploadedImage = await handleImageUpload(imageInput);
                if (uploadedImage) {
                    payload.image = uploadedImage;
                    document.getElementById('projectImagePath').value = uploadedImage;
                }
            } else {
                // read as base64 and include in payload for server-side upload
                try {
                    const dataUrl = await readFileAsDataURL(fileBlob);
                    payload.imageBase64 = dataUrl;
                    payload.imageFilename = fileBlob.name || `project_${Date.now()}.jpg`;
                } catch (e) { console.warn('Could not read image as dataURL', e); }
            }
        }

        // Prepare gallery URLs: start with existing (minus removed) and upload new files if present
        let galleryUrls = (__projectExistingGallery || []).filter(u => !__projectRemovedGallery.includes(u));

        if (__projectGalleryFiles && __projectGalleryFiles.length > 0) {
            if (supabaseClient) {
                // upload each file to Supabase Storage under projects/gallery/
                for (const f of __projectGalleryFiles) {
                    const safeName = f.name.replace(/[^a-z0-9.\-_.]/gi,'_');
                    const path = `projects/gallery/${Date.now()}_${safeName}`;
                    try {
                        const { data: uploadData, error: uploadError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, f, { upsert: true });
                        if (uploadError) throw uploadError;
                        const { data: publicData, error: publicErr } = await supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
                        if (publicErr) throw publicErr;
                        if (publicData && publicData.publicUrl) galleryUrls.push(publicData.publicUrl);
                    } catch (uerr) {
                        console.error('Gallery upload error for', f.name, uerr);
                        alert('Failed to upload gallery image: ' + f.name + '\n' + (uerr.message || uerr));
                    }
                }
            } else {
                // fallback: collect base64 entries to send to server for upload (if server supports it)
                payload.galleryBase64 = payload.galleryBase64 || [];
                for (const f of __projectGalleryFiles) {
                    try {
                        const dataUrl = await readFileAsDataURL(f);
                        payload.galleryBase64.push({ filename: f.name, dataUrl });
                    } catch (e) { console.warn('local gallery base64 read failed', e); }
                }
            }
        }

        // attach gallery to payload
        payload.gallery = galleryUrls;

        let saved = null;
        if (useClientStorage) {
            saved = await saveProjectRemote(payload);
        } else {
            // Fallback to server endpoint (requires admin pass header)
            try {
                const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-pass': ADMIN_PASSWORD }, body: JSON.stringify(payload) });
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || 'Server save failed');
                }
                saved = await res.json();
            } catch (e) { throw e; }
        }

        if (saved) {
            const projects = getProjects();
            const idx = projects.findIndex(p => p.id === (saved && saved.id));
            const localObj = {
                id: saved.id,
                title: saved.title,
                category: saved.category,
                image: saved.image || saved.image_url || saved.image_path,
                description: saved.description,
                plainDescription: saved.plain_description || saved.plainDescription,
                gallery: saved.gallery || (payload.gallery || [])
            };
            if (idx !== -1) projects[idx] = localObj; else projects.push(localObj);
            saveProjects(projects);
        }

        // reset gallery temp state
        __projectGalleryFiles = [];
        __projectExistingGallery = [];
        __projectRemovedGallery = [];
        renderProjectGalleryPreview();

        toggleProjectForm();
        await renderAdminProjects();
        alert('Project saved successfully!');
    } catch (e) {
        console.error('saveProject error', e);
        alert('Error saving project: ' + (e.message || e));
    }
}

async function editProject(id) {
    if (!supabaseClient) {
        alert('Supabase not configured. Cannot edit project.');
        return;
    }
    let project = null;
    try {
        const { data, error } = await supabaseClient.from('projects').select('*').eq('id', id).single();
        if (!error) project = data;
    } catch (e) { console.error('fetch project', e); }

    if (project) {
        const formTitle = document.getElementById('formTitle');
        if (formTitle) formTitle.textContent = "Edit Project";
        document.getElementById('editId').value = project.id;
        document.getElementById('projectTitle').value = project.title || '';
        const projectCategorySelect = document.getElementById('projectCategory');
        const projCatVal = project.category || '';
        if (projectCategorySelect) {
            if (projCatVal && !Array.from(projectCategorySelect.options).some(o => o.value === projCatVal)) {
                const opt = document.createElement('option');
                opt.value = projCatVal; opt.textContent = projCatVal;
                projectCategorySelect.appendChild(opt);
            }
            projectCategorySelect.value = projCatVal;
        }
        document.getElementById('projectImagePath').value = project.image || '';
        const vidInput = document.getElementById('projectVideoLink'); if (vidInput) vidInput.value = project.video || project.video_url || '';
        const descEl = document.getElementById('projectDescription');
        if (descEl && descEl.getAttribute && descEl.getAttribute('contenteditable') === 'true') {
            descEl.innerHTML = project.description || project.plainDescription || '';
        } else if (descEl) {
            descEl.value = project.plainDescription || project.description || '';
        }

        document.getElementById('projectImage').removeAttribute('required');

        // Initialize gallery state for editing
        __projectExistingGallery = Array.isArray(project.gallery) ? project.gallery.slice() : [];
        __projectGalleryFiles = [];
        __projectRemovedGallery = [];
        renderProjectGalleryPreview();

        toggleProjectForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateProjectPreview();
    } else {
        alert('Project not found.');
    }
}

async function deleteProject(id) {
    if (!confirm("Are you sure you want to delete this project?")) return;
    if (!supabaseClient) {
        alert('Supabase not configured. Cannot delete project.');
        return;
    }
    try {
        await deleteProjectRemote(id);

        let projects = getProjects();
        projects = projects.filter(p => p.id !== id);
        saveProjects(projects);
        await renderAdminProjects();
    } catch (e) { console.error('deleteProject error', e); alert('Delete failed: ' + (e.message || e)); }
}

/* ------------------ Content management (WYSIWYG) ------------------ */
const CONTENT_KEY = 'nb_content_data';

async function loadContentData() {
    try {
        const remote = await fetchContentRemote();
        if (remote) {
            window.__adminContent = remote;
        } else {
            window.__adminContent = {};
        }
        // initial render
        renderContentManager();
        if (window.__contentLoader && window.__adminContent) window.__contentLoader.update(window.__adminContent);
    } catch (e) {
        console.error('Could not load content from Supabase', e);
        window.__adminContent = {};
        renderContentManager();
    }
}

async function renderContentManager() {
    const d = window.__adminContent || {};
    document.getElementById('content_projects_section_title').value = d['projects.section.title'] || '';
    document.getElementById('content_contact_section_title').value = d['contact.section.title'] || '';

    // homepage fields
    document.getElementById('content_homepage_hero_title').value = d['homepage.hero.title'] || '';
    document.getElementById('content_homepage_hero_desc').value = d['homepage.hero.desc'] || '';
    document.getElementById('content_homepage_about_title').value = d['homepage.about.title'] || '';
    document.getElementById('content_homepage_about_desc').innerHTML = d['homepage.about.desc'] || '';

    // services fields
    document.getElementById('content_services_hero_title').value = d['services.hero.title'] || '';
    document.getElementById('content_services_hero_desc').value = d['services.hero.desc'] || '';
    // Typical Outputs (editable list)
    const outputsEl = document.getElementById('content_services_outputs');
    if (outputsEl) outputsEl.value = (d['services.outputs'] || []).join('\n');
    // Services hero image path and preview
    document.getElementById('content_services_hero_image_path').value = d['services.hero.image'] || '';
    const srvPreview = document.getElementById('content_services_hero_image_preview');
    if (srvPreview) {
        if (d['services.hero.image']) { srvPreview.src = d['services.hero.image']; srvPreview.style.display = ''; } else { srvPreview.src = ''; srvPreview.style.display = 'none'; }
    }

    // contact features
    document.getElementById('content_contact_section_title').value = d['contact.section.title'] || '';
    document.getElementById('content_contact_features').value = (d['contact.features'] || []).join('\n');

    // if supabase present, try to pull content from remote (site_content)
    try {
        if (supabaseClient) {
            const remote = await fetchContentRemote();
            if (remote) {
                window.__adminContent = remote;
                // re-populate with remote content
                document.getElementById('content_projects_section_title').value = window.__adminContent['projects.section.title'] || '';
                document.getElementById('content_homepage_hero_title').value = window.__adminContent['homepage.hero.title'] || '';
                document.getElementById('content_homepage_hero_desc').value = window.__adminContent['homepage.hero.desc'] || '';
                document.getElementById('content_homepage_about_title').value = window.__adminContent['homepage.about.title'] || '';
                document.getElementById('content_homepage_about_desc').innerHTML = window.__adminContent['homepage.about.desc'] || '';
                document.getElementById('content_services_hero_title').value = window.__adminContent['services.hero.title'] || '';
                document.getElementById('content_services_hero_desc').value = window.__adminContent['services.hero.desc'] || '';
                document.getElementById('content_contact_features').value = (window.__adminContent['contact.features'] || []).join('\n');
            }
        }
    } catch(e){ console.error('renderContentManager remote fetch error', e); }

    // Ensure brochure editor fields are updated when content is loaded (local or remote)
    if (typeof renderBrochuresAdmin === 'function') renderBrochuresAdmin();
    renderServicesAdmin();
}

// WYSIWYG helpers: save/restore selection so toolbar buttons work reliably across browsers
let __wysiwygSelectionRange = null;

function saveWysiwygSelection() {
    try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            __wysiwygSelectionRange = sel.getRangeAt(0).cloneRange();
        }
    } catch(e){ __wysiwygSelectionRange = null; }
}

function restoreWysiwygSelection() {
    try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        if (__wysiwygSelectionRange) sel.addRange(__wysiwygSelectionRange);
    } catch(e){}
}

function updateWysiwygToolbarState() {
    document.querySelectorAll('.wysiwyg-toolbar button[data-command]').forEach(btn => {
        const cmd = btn.getAttribute('data-command');
        try {
            const active = document.queryCommandState(cmd);
            if (active) btn.classList.add('active'); else btn.classList.remove('active');
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        } catch(e){ btn.classList.remove('active'); btn.setAttribute('aria-pressed','false'); }
    });
}

function execWysiwyg(command, value = null) {
    // restore selection (saved on editor events) before issuing command
    restoreWysiwygSelection();
    try {
        document.execCommand(command, false, value || null);
    } catch(e){}
    updateWysiwygToolbarState();
}

function createLinkPrompt() {
    const url = prompt('Enter URL (https://...)');
    if (url) execWysiwyg('createLink', url);
}

// wire up wysiwyg editors to save selection on interactions and update toolbar state
document.querySelectorAll('.wysiwyg-editor').forEach(editor => {
    editor.addEventListener('mouseup', saveWysiwygSelection);
    editor.addEventListener('keyup', (e)=>{ saveWysiwygSelection(); updateWysiwygToolbarState(); });
    editor.addEventListener('input', (e)=>{ saveWysiwygSelection(); updateWysiwygToolbarState(); });
    editor.addEventListener('focus', (e)=>{ saveWysiwygSelection(); updateWysiwygToolbarState(); });
});

// when selection changes anywhere, update toolbar if inside an editor
document.addEventListener('selectionchange', function(){
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('wysiwyg-editor')) {
        saveWysiwygSelection();
        updateWysiwygToolbarState();
    }
});

function discardContentEdits() {
    if (confirm('Discard unsaved content edits?')) renderContentManager();
}

async function saveContent() {
    // collect fields
    const d = window.__adminContent || {};
    d['projects.section.title'] = document.getElementById('content_projects_section_title').value;
    d['contact.section.title'] = document.getElementById('content_contact_section_title').value;

    // homepage
    d['homepage.hero.title'] = document.getElementById('content_homepage_hero_title').value;
    d['homepage.hero.desc'] = document.getElementById('content_homepage_hero_desc').value;
    d['homepage.about.title'] = document.getElementById('content_homepage_about_title').value;
    d['homepage.about.desc'] = document.getElementById('content_homepage_about_desc').innerHTML;

    // services
    d['services.hero.title'] = document.getElementById('content_services_hero_title').value;
    d['services.hero.desc'] = document.getElementById('content_services_hero_desc').value;

    // Typical Outputs values (lines -> array)
    try {
        const outputsEl = document.getElementById('content_services_outputs');
        d['services.outputs'] = outputsEl ? outputsEl.value.split('\n').map(l=>l.trim()).filter(Boolean) : (d['services.outputs'] || []);
    } catch(e) { d['services.outputs'] = d['services.outputs'] || []; }

    // Services hero image: upload if a new file is selected, otherwise keep existing path
    try {
        const srvImgInput = document.getElementById('content_services_hero_image');
        if (srvImgInput && srvImgInput.files && srvImgInput.files[0]) {
            const file = srvImgInput.files[0];
            if (supabaseClient) {
                const safeName = file.name.replace(/\s+/g,'_');
                const path = `content/services/${Date.now()}_${safeName}`;
                const { data: uploadData, error: uploadError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
                if (uploadError) throw uploadError;
                const { data: publicData, error: publicError } = await supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
                if (publicError) throw publicError;
                d['services.hero.image'] = publicData && publicData.publicUrl ? publicData.publicUrl : (publicData && publicData.data && publicData.data.publicUrl) || '';
                document.getElementById('content_services_hero_image_path').value = d['services.hero.image'] || '';
            } else {
                alert('Supabase not configured. Cannot upload Services hero image.');
                d['services.hero.image'] = document.getElementById('content_services_hero_image_path').value || '';
            }
        } else {
            d['services.hero.image'] = document.getElementById('content_services_hero_image_path').value || d['services.hero.image'] || '';
        }
    } catch (e) {
        console.warn('Services hero image upload failed', e);
        d['services.hero.image'] = document.getElementById('content_services_hero_image_path').value || d['services.hero.image'] || '';
    }

    // contact features (lines -> array)
    d['contact.section.title'] = document.getElementById('content_contact_section_title').value;
    d['contact.features'] = document.getElementById('content_contact_features').value.split('\n').map(l=>l.trim()).filter(Boolean);

    // brochures
    d['brochure1.title'] = document.getElementById('content_brochure1_title').value;
    d['brochure1.description'] = document.getElementById('content_brochure1_description').value;
    d['brochure1.pdf_path'] = document.getElementById('content_brochure1_pdf_path').value;
    d['brochure2.title'] = document.getElementById('content_brochure2_title').value;
    d['brochure2.description'] = document.getElementById('content_brochure2_description').value;
    d['brochure2.pdf_path'] = document.getElementById('content_brochure2_pdf_path').value;

    // try to save to Supabase
    try {
        if (supabaseClient) {
            // save into site_content table under key 'site_content'
            const payload = { key: 'site_content', value: d, updated_at: new Date() };
            const { data, error } = await supabaseClient.from('site_content').upsert(payload, { onConflict: 'key', returning: 'representation' });
            if (error) throw error;
            // After saving, re-fetch latest content from Supabase
            const { data: freshData, error: fetchError } = await supabaseClient.from('site_content').select('value').eq('key','site_content').single();
            if (fetchError) throw fetchError;
            if (freshData && freshData.value) {
                window.__adminContent = freshData.value;
            } else {
                window.__adminContent = d;
            }
            if (window.__contentLoader) window.__contentLoader.update(window.__adminContent);
            updateDashboardCounts();
            alert('Content saved to Supabase and reloaded.');
            renderContentManager();
            return;
        } else {
            throw new Error('Supabase not configured');
        }
    } catch (e) {
        console.error('saveContent error', e);
        alert('Error saving content: ' + (e.message || e));
    }
}

// Wrapper for saving content
async function saveContentWithConfirm() {
    await saveContent();
}

// Save Services helper: shows inline status and saves only content-related fields
async function saveServices() {
    const statusEl = document.getElementById('servicesSaveStatus');
    if (statusEl) statusEl.textContent = 'Saving...';
    try {
        await saveContent();
        if (statusEl) {
            statusEl.textContent = 'Saved.';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Save failed: ' + (e.message || e);
        console.error('saveServices error', e);
    }
}

function exportContent() {
    const data = window.__adminContent || {};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'content.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// fetch content object from Supabase site_content table
async function fetchContentRemote() {
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('site_content').select('value').eq('key','site_content').single();
            if (error) throw error;
            return data ? data.value : null;
        } catch(e){ console.error('fetchContentRemote error', e); return null; }
    }
    return null;
}

// --- Supabase helpers ---
async function fetchProjectsRemote() {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient.from('projects').select('*').order('id', { ascending: true });
        if (error) throw error;
        return data;
    } catch (e) { console.error('fetchProjectsRemote error', e); return null; }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveProjectRemote(payload) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    try {
        const body = Object.assign({}, payload);
        let result;
        if (body.id) {
            // Update existing project
            const { data, error } = await supabaseClient.from('projects').update(body).eq('id', body.id).select();
            if (error) throw error;
            result = data && data[0];
        } else {
            // Insert new project (remove id so Postgres can auto-generate)
            const insertBody = { ...body };
            delete insertBody.id;
            const { data, error } = await supabaseClient.from('projects').insert([insertBody]).select();
            if (error) throw error;
            result = data && data[0];
        }
        return result;
    } catch (e) { console.error('saveProjectRemote error', e); throw e; }
}

async function deleteProjectRemote(id) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    try {
        const { error } = await supabaseClient.from('projects').delete().eq('id', id);
        if (error) throw error;
        return true;
    } catch (e) { console.error('deleteProjectRemote error', e); throw e; }
}


/* Services editing */
function renderServicesAdmin() {
    const list = document.getElementById('servicesAdminList');
    list.innerHTML = '';
    const arr = (window.__adminContent && window.__adminContent['services.cards']) || [];
    arr.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'service-item';
        div.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <img src="${s.icon||s.iconData||'assets/images/icons/placeholder.svg'}" alt="" />
                <div>
                    <div style="font-weight:700">${s.title||'(no title)'}</div>
                    <div class="small-muted">${(s.list||[]).slice(0,2).join(' • ')}</div>
                </div>
            </div>
            <div class="service-actions">
                <button class="cta-button" onclick="editService(${i})">Edit</button>
                <button class="cta-button" style="background:#ff4d4d;" onclick="deleteService(${i})">Delete</button>
            </div>
        `;
        list.appendChild(div);
    });
    updateDashboardCounts();
} 

function showServiceForm(index) {
    window.__editingServiceIndex = (typeof index === 'number') ? index : null;
    const modal = document.getElementById('serviceModal');
    const preview = document.getElementById('serviceIconPreview');
    const title = document.getElementById('serviceTitle');
    const list = document.getElementById('serviceList');
    const link = document.getElementById('serviceLink');
    const fileInput = document.getElementById('serviceIcon');

    // reset
    if (fileInput) fileInput.value = '';
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (title) title.value = '';
    if (list) list.value = '';
    if (link) link.value = '';

    if (typeof index === 'number') {
        const s = (window.__adminContent && window.__adminContent['services.cards'] || [])[index];
        if (s) {
            if (title) title.value = s.title || '';
            if (list) list.value = (s.list || []).join('\n');
            if (link) link.value = s.link || '';
            if (s.icon || s.iconData) { const url = s.iconData || s.icon; if (preview) { preview.src = url; preview.style.display = 'block'; } }
        }
    }

    modal.classList.add('active'); modal.setAttribute('aria-hidden','false');
    setTimeout(()=> title && title.focus(), 50);
    updateServiceCardPreview();
} 
function hideServiceForm(){
    const modal = document.getElementById('serviceModal');
    if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden','true'); }
    window.__editingServiceIndex = null;
}

function editService(i) { showServiceForm(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function deleteService(i) {
    if (!confirm('Delete this service card?')) return;
    const arr = (window.__adminContent && window.__adminContent['services.cards']) || [];
    arr.splice(i,1);
    window.__adminContent['services.cards'] = arr;
    renderServicesAdmin();
    saveContent();
}

// handle icon input preview
const serviceIconInput = document.getElementById('serviceIcon');
if (serviceIconInput) serviceIconInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
        const img = document.getElementById('serviceIconPreview');
        if (img) { img.src = ev.target.result; img.style.display = 'block'; }
        // also reflect into modal preview icon
        const modalIcon = document.getElementById('modalPreviewIcon'); if (modalIcon) modalIcon.src = ev.target.result;
        updateServiceCardPreview();
    };
    reader.readAsDataURL(file);
});

// Update the preview card when editing fields
function updateServiceCardPreview() {
    try {
        const title = document.getElementById('serviceTitle').value || 'Service Title';
        const listTxt = document.getElementById('serviceList').value || '';
        const link = document.getElementById('serviceLink').value || '#';
        const iconPreview = document.getElementById('serviceIconPreview');

        // update section preview if exists
        const secTitle = document.getElementById('previewTitle');
        const secList = document.getElementById('previewList');
        const secLink = document.getElementById('previewLink');
        const secIcon = document.getElementById('previewIcon');
        if (secTitle) secTitle.textContent = title;
        if (secList) {
            secList.innerHTML = '';
            listTxt.split('\n').map(l=>l.trim()).filter(Boolean).forEach(li => { const liEl = document.createElement('li'); liEl.textContent = li; secList.appendChild(liEl); });
        }
        if (secLink) secLink.href = link;
        if (iconPreview && iconPreview.src && secIcon) secIcon.src = iconPreview.src;

        // update modal preview if exists
        const modalTitle = document.getElementById('modalPreviewTitle');
        const modalList = document.getElementById('modalPreviewList');
        const modalLink = document.getElementById('modalPreviewLink');
        const modalIcon = document.getElementById('modalPreviewIcon');
        if (modalTitle) modalTitle.textContent = title;
        if (modalList) {
            modalList.innerHTML = '';
            listTxt.split('\n').map(l=>l.trim()).filter(Boolean).forEach(li => { const liEl = document.createElement('li'); liEl.textContent = li; modalList.appendChild(liEl); });
        }
        if (modalLink) modalLink.href = link;
        if (iconPreview && iconPreview.src && modalIcon) modalIcon.src = iconPreview.src;
    } catch(e){}
}

// wire up inputs to update preview
['serviceTitle','serviceList','serviceLink'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateServiceCardPreview);
});

/* Project preview handling inside modal */
function updateProjectPreview() {
    try {
        const title = document.getElementById('projectTitle')?.value || 'Project Title';
        const category = document.getElementById('projectCategory')?.value || '';
        const descEl = document.getElementById('projectDescription');
        let desc = '';
        if (descEl) {
            if (descEl.getAttribute && descEl.getAttribute('contenteditable') === 'true') desc = descEl.innerHTML || '';
            else desc = descEl.value || '';
        }
        const imgEl = document.getElementById('projectImagePreview');

        const projTitle = document.getElementById('projPreviewTitle');
        if (projTitle) projTitle.textContent = title;
        const projCat = document.getElementById('projPreviewCategory');
        if (projCat) projCat.textContent = category;
        // if the description contains HTML, use it directly; otherwise format plain text
        if (desc.trim().startsWith('<') || desc.trim().includes('<p') || desc.trim().includes('<ul') || desc.trim().includes('<br')) {
            document.getElementById('projPreviewDescription').innerHTML = desc;
        } else {
            document.getElementById('projPreviewDescription').innerHTML = formatDescription(desc);
        }

        // gallery preview (optional)
        try {
            const galleryEl = document.getElementById('projPreviewGallery');
            if (galleryEl) {
                galleryEl.innerHTML = '';
                // existing URLs
                (__projectExistingGallery || []).forEach(url => { if (__projectRemovedGallery.includes(url)) return; const i = document.createElement('img'); i.src = url; i.style.width = '64px'; i.style.height = '48px'; i.style.objectFit = 'cover'; i.style.borderRadius = '6px'; galleryEl.appendChild(i); });
                // newly selected files
                __projectGalleryFiles.forEach(file => { const reader = new FileReader(); const i = document.createElement('img'); i.style.width = '64px'; i.style.height = '48px'; i.style.objectFit = 'cover'; i.style.borderRadius = '6px'; reader.onload = function(ev){ i.src = ev.target.result; }; reader.readAsDataURL(file); galleryEl.appendChild(i); });
            }
        } catch(e){}

        // video preview (optional)
        try {
            const vidEl = document.getElementById('projPreviewVideo');
            const vidInput = document.getElementById('projectVideoLink');
            const url = (vidInput && vidInput.value) ? vidInput.value.trim() : '';
            if (vidEl) {
                if (url) {
                    vidEl.style.display = 'block';
                    vidEl.innerHTML = createEmbedForVideo(url, 320);
                } else {
                    vidEl.style.display = 'none';
                    vidEl.innerHTML = '';
                }
            }
        } catch(e){}

        // If a temporary preview image exists (from file input), it will be stored on imgEl.dataset.temp
        if (imgEl && imgEl.dataset.temp) {
            imgEl.src = imgEl.dataset.temp;
        } else {
            // if editing existing project, try to load stored image
            const path = document.getElementById('projectImagePath')?.value || '';
            if (path) {
                const filename = path.split('/').pop();
                const stored = filename ? localStorage.getItem('img_' + filename) : null;
                if (stored) imgEl.src = stored;
                else imgEl.src = 'assets/images/icons/placeholder.svg';
            } else {
                imgEl.src = 'assets/images/icons/placeholder.svg';
            }
        }
    } catch(e){}
}

// wire up project input events
['projectTitle','projectCategory','projectDescription','projectVideoLink'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateProjectPreview);
});

// handle image input preview specifically
const projectImageInput = document.getElementById('projectImage');
if (projectImageInput) projectImageInput.addEventListener('change', function(e){
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev){
        const img = document.getElementById('projectImagePreview');
        img.src = ev.target.result; img.dataset.temp = ev.target.result; // store temp preview
    };
    reader.readAsDataURL(file);
});

// handle gallery input preview + selection (multiple)
const projectGalleryInput = document.getElementById('projectGallery');
if (projectGalleryInput) projectGalleryInput.addEventListener('change', function(e){
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // enforce limits: max files and max size
    const totalExisting = (__projectExistingGallery && __projectExistingGallery.length) ? __projectExistingGallery.length : 0;
    const allowable = Math.max(0, GALLERY_MAX_FILES - totalExisting - __projectGalleryFiles.length);
    if (files.length > allowable) {
        alert(`You can only add ${allowable} more image(s) (max ${GALLERY_MAX_FILES} in total).`);
    }

    files.slice(0, allowable).forEach(f => {
        if (f.size > GALLERY_MAX_FILE_SIZE) { alert(`${f.name} is larger than ${GALLERY_MAX_FILE_SIZE/1024/1024}MB and was skipped.`); return; }
        __projectGalleryFiles.push(f);
    });

    renderProjectGalleryPreview();
});

function renderProjectGalleryPreview() {
    const preview = document.getElementById('projectGalleryPreview');
    if (!preview) return;
    preview.innerHTML = '';

    // existing URLs first
    (__projectExistingGallery || []).forEach((url, idx) => {
        if (__projectRemovedGallery.includes(url)) return; // skip removed
        const div = document.createElement('div');
        div.style.position = 'relative';
        div.style.width = '80px';
        div.style.height = '80px';
        div.style.overflow = 'hidden';
        div.style.borderRadius = '6px';
        const img = document.createElement('img');
        img.src = url; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
        const btn = document.createElement('button');
        btn.textContent = '×'; btn.title = 'Remove';
        btn.style.position = 'absolute'; btn.style.top = '4px'; btn.style.right = '4px'; btn.style.background = 'rgba(0,0,0,0.6)'; btn.style.color = '#fff'; btn.style.border = 'none'; btn.style.borderRadius = '50%'; btn.style.width = '20px'; btn.style.height = '20px'; btn.style.cursor = 'pointer';
        btn.addEventListener('click', function(){ __projectRemovedGallery.push(url); renderProjectGalleryPreview(); updateProjectPreview(); });
        div.appendChild(img); div.appendChild(btn); preview.appendChild(div);
    });

    // newly selected files
    __projectGalleryFiles.forEach((file, idx) => {
        const div = document.createElement('div');
        div.style.position = 'relative';
        div.style.width = '80px';
        div.style.height = '80px';
        div.style.overflow = 'hidden';
        div.style.borderRadius = '6px';
        const img = document.createElement('img');
        img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
        const btn = document.createElement('button');
        btn.textContent = '×'; btn.title = 'Remove';
        btn.style.position = 'absolute'; btn.style.top = '4px'; btn.style.right = '4px'; btn.style.background = 'rgba(0,0,0,0.6)'; btn.style.color = '#fff'; btn.style.border = 'none'; btn.style.borderRadius = '50%'; btn.style.width = '20px'; btn.style.height = '20px'; btn.style.cursor = 'pointer';
        btn.addEventListener('click', function(){ __projectGalleryFiles.splice(idx,1); renderProjectGalleryPreview(); updateProjectPreview(); });
        const reader = new FileReader();
        reader.onload = function(ev){ img.src = ev.target.result; };
        reader.readAsDataURL(file);
        div.appendChild(img); div.appendChild(btn); preview.appendChild(div);
    });
}



function saveService() {
    const title = document.getElementById('serviceTitle').value.trim();
    const list = document.getElementById('serviceList').value.split('\n').map(l=>l.trim()).filter(Boolean);
    const link = document.getElementById('serviceLink').value.trim();

    // get icon data if file provided
    const fileInput = document.getElementById('serviceIcon');
    const arr = (window.__adminContent && window.__adminContent['services.cards']) || [];

    function doSave(iconData) {
        const obj = { icon: iconData || '', iconAlt: title || '', title, list, link };
        if (typeof window.__editingServiceIndex === 'number') {
            arr[window.__editingServiceIndex] = obj;
        } else {
            arr.push(obj);
        }
        window.__adminContent['services.cards'] = arr;
        renderServicesAdmin();
        hideServiceForm();
        saveContent();
    }

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const f = fileInput.files[0];
        // If Supabase client available, upload to STORAGE_BUCKET and store public URL
        if (supabaseClient) {
            (async function(){
                try {
                    const safeName = f.name.replace(/[^a-z0-9._-]/gi,'_');
                    const path = `services/icons/${Date.now()}_${safeName}`;
                    const { data: uploadData, error: uploadError } = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path, f, { upsert: true });
                    if (uploadError) throw uploadError;
                    const { data: publicData, error: publicErr } = await supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
                    if (publicErr) throw publicErr;
                    const publicUrl = (publicData && (publicData.publicUrl || (publicData.data && publicData.data.publicUrl))) ? (publicData.publicUrl || publicData.data.publicUrl) : null;
                    if (publicUrl) { doSave(publicUrl); return; }
                } catch (e) {
                    console.warn('Icon upload failed, falling back to base64', e);
                }
                // fallback to base64
                const reader = new FileReader();
                reader.onload = function(ev){ doSave(ev.target.result); };
                reader.readAsDataURL(f);
            })();
        } else {
            // no supabase client: fallback to base64
            const reader = new FileReader();
            reader.onload = function(ev){ doSave(ev.target.result); };
            reader.readAsDataURL(f);
        }
    } else {
        // if editing and preview present, reuse that
        const preview = document.getElementById('serviceIconPreview');
        const iconData = preview && preview.src ? preview.src : '';
        doSave(iconData);
    }
}

// try to auto-load content on admin open
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function(){
        // keep previous behavior
        if (localStorage.getItem('admin_logged_in') === 'true') showDashboard();
        syncWithJSON();
        loadContentData();
        initAdminUI();
        // initialize Supabase client from code/meta-based envs
        initSupabase();
        updateDashboardCounts();
    });
}



/* Brochures Management */
function renderBrochuresAdmin() {
    const d = window.__adminContent || {};

    // clear status
    const statusEl = document.getElementById('brochureUploadStatus'); if (statusEl) statusEl.textContent = '';

    // Brochure 1 - Company Brochure
    document.getElementById('content_brochure1_title').value = d['brochure1.title'] || 'Company Brochure';
    document.getElementById('content_brochure1_description').value = d['brochure1.description'] || '';
    document.getElementById('content_brochure1_pdf_path').value = d['brochure1.pdf_path'] || '';
    document.getElementById('content_brochure1_image_path').value = d['brochure1.image_path'] || '';
    // set brochure image preview and wire file input preview
    const b1Prev = document.getElementById('brochure1_image_preview');
    if (b1Prev) {
        if (d['brochure1.image_path']) { b1Prev.src = d['brochure1.image_path']; b1Prev.style.display = ''; } else { b1Prev.src = ''; b1Prev.style.display = 'none'; }
    }
    const b1Input = document.getElementById('brochure1_image');
    if (b1Input) {
        b1Input.onchange = function(){
            const f = b1Input.files[0];
            if (f) {
                const r = new FileReader();
                r.onload = e => { if (b1Prev) { b1Prev.src = e.target.result; b1Prev.style.display = ''; } };
                r.readAsDataURL(f);
            } else {
                if (b1Prev) { b1Prev.src = ''; b1Prev.style.display = 'none'; }
            }
        };
    }

    // Show current PDF
    const currentPdf1 = document.getElementById('brochure1_current_pdf');
    if (currentPdf1) {
      if (d['brochure1.pdf_path']) {
          currentPdf1.innerHTML = `Current PDF: <a href="${d['brochure1.pdf_path']}" target="_blank">${d['brochure1.pdf_path']}</a>`;
      } else {
          currentPdf1.innerHTML = '';
      }
    }

    // Brochure 2 - Personal Profile
    document.getElementById('content_brochure2_title').value = d['brochure2.title'] || 'Personal Profile';
    document.getElementById('content_brochure2_description').value = d['brochure2.description'] || '';
    document.getElementById('content_brochure2_pdf_path').value = d['brochure2.pdf_path'] || '';
    document.getElementById('content_brochure2_image_path').value = d['brochure2.image_path'] || '';

    // Show current PDF
    const currentPdf2 = document.getElementById('brochure2_current_pdf');
    if (currentPdf2) {
      if (d['brochure2.pdf_path']) {
          currentPdf2.innerHTML = `Current PDF: <a href="${d['brochure2.pdf_path']}" target="_blank">${d['brochure2.pdf_path']}</a>`;
      } else {
          currentPdf2.innerHTML = '';
      }
    }

    // set brochure2 image preview and wire file input preview
    const b2Prev = document.getElementById('brochure2_image_preview');
    if (b2Prev) {
        if (d['brochure2.image_path']) { b2Prev.src = d['brochure2.image_path']; b2Prev.style.display = ''; } else { b2Prev.src = ''; b2Prev.style.display = 'none'; }
    }
    const b2Input = document.getElementById('brochure2_image');
    if (b2Input) {
        b2Input.onchange = function(){ const f = b2Input.files[0]; if (f){ const r = new FileReader(); r.onload = e => { if (b2Prev) { b2Prev.src = e.target.result; b2Prev.style.display = ''; } }; r.readAsDataURL(f);} else { if (b2Prev){ b2Prev.src=''; b2Prev.style.display='none'; } } };
    }
}

async function saveBrochures() {
    const d = window.__adminContent || {};
    const statusEl = document.getElementById('brochureUploadStatus');
    const saveBtn = document.getElementById('saveBrochuresBtn');

    function setStatus(msg, busy = false) {
        if (statusEl) statusEl.textContent = msg || '';
        if (saveBtn) saveBtn.disabled = !!busy;
    }

    async function uploadFileToBucket(file, bucket, dir = 'brochures') {
        try {
            const safeName = file.name.replace(/\s+/g,'_');
            const path = `${dir}/${Date.now()}_${safeName}`;
            const { data: uploadData, error: uploadError } = await supabaseClient.storage.from(bucket).upload(path, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: publicData, error: publicError } = await supabaseClient.storage.from(bucket).getPublicUrl(path);
            if (publicError) throw publicError;
            return publicData && publicData.publicUrl ? publicData.publicUrl : null;
        } catch (e) {
            console.warn('upload error', e);
            return null;
        }
    }

// Helper to create embed HTML for video links (supports YouTube and direct mp4 links)
function createEmbedForVideo(url, height = 210) {
    if (!url) return '';
    const u = url.trim();
    // YouTube long URL
    try {
        const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
        if (ytMatch && ytMatch[1]) {
            const id = ytMatch[1];
            return `<div class="video-embed" style="width:100%;"><iframe width="100%" height="${height}" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        // direct mp4
        if (u.match(/\.mp4(\?|$)/i)) {
            return `<div class="video-embed" style="width:100%;"><video controls style="width:100%; max-height:${height}px;"> <source src="${u}" type="video/mp4">Your browser does not support the video tag.</video></div>`;
        }
        // Vimeo quick support
        const vimeo = u.match(/vimeo\.com\/(\d+)/);
        if (vimeo && vimeo[1]) {
            return `<div class="video-embed" style="width:100%;"><iframe width="100%" height="${height}" src="https://player.vimeo.com/video/${vimeo[1]}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        // fallback: link
        return `<div class="video-embed"><a href="${u}" target="_blank">Open video</a></div>`;
    } catch (e) { return '';} }


    // Collect fields (only title & description remain editable)
    d['brochure1.title'] = document.getElementById('content_brochure1_title').value;
    d['brochure1.description'] = document.getElementById('content_brochure1_description').value;
    d['brochure1.image_path'] = document.getElementById('content_brochure1_image_path').value;
    d['brochure2.title'] = document.getElementById('content_brochure2_title').value;
    d['brochure2.description'] = document.getElementById('content_brochure2_description').value;
    d['brochure2.image_path'] = document.getElementById('content_brochure2_image_path').value;

    // default bucket (hidden from UI)
    const bucketName = STORAGE_BUCKET;

    try {
        setStatus('Preparing uploads...', true);

        // Brochure 1 PDF
        const pdf1Input = document.getElementById('brochure1_pdf');
        if (pdf1Input && pdf1Input.files && pdf1Input.files[0]) {
            const file = pdf1Input.files[0];
            if (supabaseClient) {
                setStatus(`Uploading ${file.name}...`, true);
                const url = await uploadFileToBucket(file, bucketName, 'brochures');
                if (url) d['brochure1.pdf_path'] = url;
                else { d['brochure1.pdf_path'] = `assets/${file.name}`; alert(`Upload failed: please manually copy the PDF to assets/${file.name}`); }
            } else {
                alert('Supabase not configured. Cannot upload PDF.');
                return;
            }
        } else {
            d['brochure1.pdf_path'] = document.getElementById('content_brochure1_pdf_path').value;
        }


        // Brochure 2 PDF
        const pdf2Input = document.getElementById('brochure2_pdf');
        if (pdf2Input && pdf2Input.files && pdf2Input.files[0]) {
            const file = pdf2Input.files[0];
            if (supabaseClient) {
                setStatus(`Uploading ${file.name}...`, true);
                const url = await uploadFileToBucket(file, bucketName, 'brochures');
                if (url) d['brochure2.pdf_path'] = url;
                else { d['brochure2.pdf_path'] = `assets/${file.name}`; alert(`Upload failed: please manually copy the PDF to assets/${file.name}`); }
            } else {
                alert('Supabase not configured. Cannot upload PDF.');
                return;
            }
        } else {
            d['brochure2.pdf_path'] = document.getElementById('content_brochure2_pdf_path').value;
        }

        // Brochure images (upload if provided)
        const img1Input = document.getElementById('brochure1_image');
        if (img1Input && img1Input.files && img1Input.files[0]) {
            const file = img1Input.files[0];
            if (supabaseClient) {
                setStatus(`Uploading ${file.name}...`, true);
                const url = await uploadFileToBucket(file, bucketName, 'content/brochures');
                if (url) d['brochure1.image_path'] = url;
                else { d['brochure1.image_path'] = document.getElementById('content_brochure1_image_path').value || ''; alert(`Image upload failed: please manually copy the image and set the path.`); }
            } else {
                alert('Supabase not configured. Cannot upload brochure image.');
                d['brochure1.image_path'] = document.getElementById('content_brochure1_image_path').value || '';
            }
        } else {
            d['brochure1.image_path'] = document.getElementById('content_brochure1_image_path').value || d['brochure1.image_path'] || '';
        }

        const img2Input = document.getElementById('brochure2_image');
        if (img2Input && img2Input.files && img2Input.files[0]) {
            const file = img2Input.files[0];
            if (supabaseClient) {
                setStatus(`Uploading ${file.name}...`, true);
                const url = await uploadFileToBucket(file, bucketName, 'content/brochures');
                if (url) d['brochure2.image_path'] = url;
                else { d['brochure2.image_path'] = document.getElementById('content_brochure2_image_path').value || ''; alert(`Image upload failed: please manually copy the image and set the path.`); }
            } else {
                alert('Supabase not configured. Cannot upload brochure image.');
                d['brochure2.image_path'] = document.getElementById('content_brochure2_image_path').value || '';
            }
        } else {
            d['brochure2.image_path'] = document.getElementById('content_brochure2_image_path').value || d['brochure2.image_path'] || '';
        }

        window.__adminContent = d;

        setStatus('Saving content...', true);
        await saveContent();

        setStatus('Brochures saved successfully.');
        renderBrochuresAdmin();
    } catch (e) {
        console.error('saveBrochures error', e);
        setStatus('Error saving brochures: ' + (e.message || e));
        alert('Error saving brochures: ' + (e.message || e));
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function signInToSupabase() {
    if (!supabaseClient) {
        alert('Supabase not configured. Set the meta tags for supabase-url and supabase-anon-key.');
        return;
    }
    const email = document.getElementById('supabase_email').value;
    const password = document.getElementById('supabase_password').value;
    if (!email || !password) {
        alert('Enter email and password.');
        return;
    }
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        alert('Signed in to Supabase successfully.');
        // Re-check auth state
        checkAuthState();
    } catch (e) {
        alert('Sign in failed: ' + (e.message || e));
    }
}

