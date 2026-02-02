const ADMIN_PASSWORD = "admin"; // Placeholder
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
    renderAdminProjects();
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
    const form = document.getElementById('projectForm');
    const actualForm = document.getElementById('actualForm');

    if (form.style.display === 'block' && !isEdit) {
        form.style.display = 'none';
        actualForm.reset();
        document.getElementById('editId').value = '';
        document.getElementById('projectImagePath').value = '';
    } else {
        form.style.display = 'block';
        if (!isEdit) {
            document.getElementById('formTitle').textContent = "Add New Project";
            actualForm.reset();
            document.getElementById('editId').value = '';
            document.getElementById('projectImagePath').value = '';
            document.getElementById('projectImage').setAttribute('required', 'required');
        }
    }
}

function renderAdminProjects() {
    const projects = getProjects();
    const list = document.getElementById('adminProjectList');
    list.innerHTML = '';

    projects.forEach(project => {
        const item = document.createElement('div');
        item.className = 'admin-project-item';
        item.innerHTML = `
            <div class="admin-project-info">
                <h3>${project.title}</h3>
                <p>${project.category} | ${project.year} | ${project.client}</p>
            </div>
            <div class="admin-actions">
                <button onclick="editProject(${project.id})" class="cta-button btn-edit">EDIT</button>
                <button onclick="deleteProject(${project.id})" class="cta-button btn-delete">DELETE</button>
            </div>
        `;
        list.appendChild(item);
    });
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
        client: document.getElementById('projectClient').value,
        year: document.getElementById('projectYear').value,
        location: document.getElementById('projectLocation').value,
        status: document.getElementById('projectStatus').value,
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
        document.getElementById('projectClient').value = project.client;
        document.getElementById('projectYear').value = project.year;
        document.getElementById('projectLocation').value = project.location || '';
        document.getElementById('projectStatus').value = project.status || 'Completed';
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
