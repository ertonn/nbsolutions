let ADMIN_PASSWORD = localStorage.getItem('nb_admin_pass') || 'admin'; // stored locally if set
const STORAGE_KEY = "nb_projects_data";

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('admin_logged_in') === 'true') {
        showDashboard();
    }
    syncWithJSON(); // Ensure local storage has initial data
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
    updateDashboardCounts();
}

function showSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(sectionId);
    if (el) el.classList.add('active');

    // Only show the main projects area for Projects and Overview sections
    const projectsArea = document.getElementById('projectsArea');
    if (projectsArea) {
        if (sectionId === 'projects-section' || sectionId === 'dashboard-section') {
            projectsArea.style.display = 'block';
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
            e.preventDefault();
            const section = this.getAttribute('data-section');
            if (!section) return;
            if (this.id === 'sidebarLogout') { logout(); return; }
            document.querySelectorAll('.sidebar .nav-link').forEach(a => a.classList.remove('active'));
            this.classList.add('active');
            showSection(section);
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
        // populate categories dynamically
        const cats = Array.from(new Set(getProjects().map(p=>p.category))).filter(Boolean);
        category.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
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
                const img = document.getElementById('projectImagePreview'); if (img) { delete img.dataset.temp; img.src = 'assets/images/icons/placeholder.png'; }
                const sicon = document.getElementById('serviceIconPreview'); if (sicon && !sicon.src.includes('data:')) { /* keep existing */ } else if (sicon) { sicon.src = ''; sicon.style.display = 'none'; }
            }
        });
    });

    // close modals with Escape (clear temp previews)
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { document.querySelectorAll('.modal-backdrop.active').forEach(m => { m.classList.remove('active'); m.setAttribute('aria-hidden','true'); }); const img = document.getElementById('projectImagePreview'); if (img) { delete img.dataset.temp; img.src = 'assets/images/icons/placeholder.png'; } } });
} 

function changePassword() {
    const p = document.getElementById('settings_admin_password').value.trim();
    if (!p) { alert('Enter a new password'); return; }
    localStorage.setItem('nb_admin_pass', p);
    ADMIN_PASSWORD = p;
    alert('Password updated (local only).');
    document.getElementById('settings_admin_password').value = '';
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
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
        if (imgPreview) { delete imgPreview.dataset.temp; imgPreview.src = 'assets/images/icons/placeholder.png'; }
    } else {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden','false');
        if (!isEdit) {
            document.getElementById('formTitle').textContent = "Add New Project";
            actualForm.reset();
            document.getElementById('editId').value = '';
            document.getElementById('projectImagePath').value = '';
            document.getElementById('projectImage').setAttribute('required', 'required');
            setTimeout(() => document.getElementById('projectTitle').focus(), 50);
            // ensure preview starts fresh
            if (imgPreview) { delete imgPreview.dataset.temp; imgPreview.src = 'assets/images/icons/placeholder.png'; }
            updateProjectPreview();
        } else {
            // editing existing: remove required from image input since it may already exist
            document.getElementById('projectImage').removeAttribute('required');
            setTimeout(() => document.getElementById('projectTitle').focus(), 50);
            updateProjectPreview();
        }
    }
} 

function renderAdminProjects() {
    const projects = getProjects();
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
        // try to render preview image stored in localStorage: 'img_<filename>'
        const filename = project.image ? project.image.split('/').pop() : '';
        const preview = filename ? (localStorage.getItem('img_' + filename) || project.image) : '';
        item.innerHTML = `
            <div style="display:flex; gap:12px; align-items:center;">
                <img src="${preview || 'assets/images/icons/placeholder.png'}" alt="" style="height:64px;width:64px;object-fit:cover;border-radius:8px;">
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
    document.getElementById('dashboardProjectsCount') && (document.getElementById('dashboardProjectsCount').textContent = projects.length);
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
    const filename = `${timestamp}-${sanitizedName}`;
    const relativePath = `assets/images/different categories/projects/${filename}`;

    // Convert to base64 and store temporarily
    // When migrating to PHP, replace this with actual file upload
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            // Store the image data URL temporarily
            localStorage.setItem(`img_${filename}`, e.target.result);
            resolve(relativePath);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function saveProject(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const projects = getProjects();

    // Handle image upload
    const imageInput = document.getElementById('projectImage');
    let imagePath = document.getElementById('projectImagePath').value; // For edit mode

    if (imageInput.files && imageInput.files[0]) {
        imagePath = await handleImageUpload(imageInput);
    }

    if (!imagePath) {
        alert('Please select an image');
        return;
    }

    // Format description from plain text to HTML
    const plainDescription = document.getElementById('projectDescription').value;
    const formattedDescription = formatDescription(plainDescription);

    const newProject = {
        id: id ? parseInt(id) : Date.now(),
        title: document.getElementById('projectTitle').value,
        category: document.getElementById('projectCategory').value,
        image: imagePath,
        description: formattedDescription,
        plainDescription: plainDescription // Store original for editing
    };

    if (id) {
        const index = projects.findIndex(p => p.id === parseInt(id));
        projects[index] = newProject;
    } else {
        projects.push(newProject);
    }

    saveProjects(projects);
    toggleProjectForm();
    renderAdminProjects();
    alert("Project saved successfully!");
}

function editProject(id) {
    const projects = getProjects();
    const project = projects.find(p => p.id === id);

    if (project) {
        document.getElementById('formTitle').textContent = "Edit Project";
        document.getElementById('editId').value = project.id;
        document.getElementById('projectTitle').value = project.title;
        document.getElementById('projectCategory').value = project.category;
        document.getElementById('projectImagePath').value = project.image; // Store current image path
        // Use plain description if available, otherwise use formatted
        document.getElementById('projectDescription').value = project.plainDescription || project.description;

        // Remove required from image input when editing (already has image)
        document.getElementById('projectImage').removeAttribute('required');

        toggleProjectForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function deleteProject(id) {
    if (confirm("Are you sure you want to delete this project?")) {
        let projects = getProjects();
        projects = projects.filter(p => p.id !== id);
        saveProjects(projects);
        renderAdminProjects();
    }
}

/* ------------------ Content management (WYSIWYG) ------------------ */
const CONTENT_KEY = 'nb_content_data';

async function loadContentData() {
    try {
        let res = await fetch('assets/misc/content.json', {cache: 'no-store'});
        let data = await res.json();
        window.__adminContent = data;
        // if previously saved locally, merge
        const local = localStorage.getItem(CONTENT_KEY);
        if (local) {
            try { const parsed = JSON.parse(local); window.__adminContent = Object.assign({}, data, parsed); } catch(e){}
        }
        // initial render
        renderContentManager();
        if (window.__contentLoader && window.__adminContent) window.__contentLoader.update(window.__adminContent);
    } catch (e) {
        console.error('Could not load content.json', e);
        // fallback to localStorage
        const local = localStorage.getItem(CONTENT_KEY);
        if (local) {
            window.__adminContent = JSON.parse(local);
            renderContentManager();
            if (window.__contentLoader) window.__contentLoader.update(window.__adminContent);
        }
    }
}

function renderContentManager() {
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

    // contact features
    document.getElementById('content_contact_section_title').value = d['contact.section.title'] || '';
    document.getElementById('content_contact_features').value = (d['contact.features'] || []).join('\n');

    renderServicesAdmin();
}

function execWysiwyg(command) {
    document.execCommand(command, false, null);
}

function createLinkPrompt() {
    const url = prompt('Enter URL (https://...)');
    if (url) document.execCommand('createLink', false, url);
}

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

    // contact features (lines -> array)
    d['contact.section.title'] = document.getElementById('content_contact_section_title').value;
    d['contact.features'] = document.getElementById('content_contact_features').value.split('\n').map(l=>l.trim()).filter(Boolean);

    // try to POST to API if available
    try {
        const res = await fetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(d)
        });
        if (res.ok) {
            alert('Content saved to server.');
        } else {
            throw new Error('Server responded ' + res.status);
        }
    } catch (e) {
        // fallback: save locally
        localStorage.setItem(CONTENT_KEY, JSON.stringify(d));
        alert('Content saved locally (no server API available).');
    }

    window.__adminContent = d;
    if (window.__contentLoader) window.__contentLoader.update(window.__adminContent);
    updateDashboardCounts();
}

function exportContent() {
    const data = window.__adminContent || {};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'content.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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
                <img src="${s.icon||s.iconData||'assets/images/icons/placeholder.png'}" alt="" />
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
        const desc = document.getElementById('projectDescription')?.value || '';
        const imgEl = document.getElementById('projectImagePreview');

        document.getElementById('projPreviewTitle').textContent = title;
        document.getElementById('projPreviewCategory').textContent = category;
        document.getElementById('projPreviewDescription').innerHTML = formatDescription(desc);

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
                else imgEl.src = 'assets/images/icons/placeholder.png';
            } else {
                imgEl.src = 'assets/images/icons/placeholder.png';
            }
        }
    } catch(e){}
}

// wire up project input events
['projectTitle','projectCategory','projectDescription'].forEach(id => {
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
        const reader = new FileReader();
        reader.onload = function(ev){ doSave(ev.target.result); };
        reader.readAsDataURL(fileInput.files[0]);
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
        updateDashboardCounts();
    });
}
