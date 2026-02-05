document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = "nb_projects_data";

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
        } catch (e) { return '';}
    }

    // Load projects from Storage or JSON
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        const data = JSON.parse(localData);
        renderProjects(data);
        setupAdminLink(data);
    } else {
        fetch('js/projects-data.json')
            .then(response => response.json())
            .then(data => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                renderProjects(data);
                setupAdminLink(data);
            })
            .catch(error => console.error('Error loading projects:', error));
    }

    // Helper to get image source (checks localStorage for base64, otherwise uses path)
    function getImageSrc(imagePath) {
        if (!imagePath) return '';
        const filename = imagePath.split('/').pop();
        const storedImage = localStorage.getItem(`img_${filename}`);
        return storedImage || imagePath;
    }

    function renderProjects(projects) {
        const categories = {};
        projects.forEach(project => {
            if (!categories[project.category]) {
                categories[project.category] = [];
            }
            categories[project.category].push(project);
        });

        const projectsContainer = document.querySelector('.projects-container');
        projectsContainer.innerHTML = '';

        for (const [categoryName, categoryProjects] of Object.entries(categories)) {
            const categorySection = document.createElement('div');
            categorySection.className = 'project-category';
            categorySection.id = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

            const categoryHeader = `
                <div class="category-header">
                    <span class="section-subtitle">[ Our Portfolio ]</span>
                    <h2 class="section-title">${categoryName}</h2>
                </div>
            `;

            const grid = document.createElement('div');
            grid.className = 'project-links-grid';

            categoryProjects.forEach(project => {
                const card = document.createElement('div');
                card.className = 'project-link-card';
                card.id = `project-${project.id}`;
                card.innerHTML = `
                    <div class="card-image-wrapper">
                        <img src="${getImageSrc(project.image)}" alt="${project.title}" loading="lazy">
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${project.title}</h3>
                        ${project.video ? `<div class="card-video">${createEmbedForVideo(project.video, 150)}</div>` : ''}
                        <a href="javascript:void(0)" class="project-link" onclick="openProjectModal(${project.id})">View in Portfolio</a>
                    </div>
                `;
                grid.appendChild(card);
            });

            categorySection.innerHTML = categoryHeader;
            categorySection.appendChild(grid);
            projectsContainer.appendChild(categorySection);
        }
    }

    // Modal Logic
    window.openProjectModal = function (projectId) {
        const projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const project = projects.find(p => p.id === projectId);
        if (project) {
            const modal = document.getElementById('projectModal');

            // Populate Modal Data
            document.getElementById('modalTitle').textContent = project.title;
            document.getElementById('modalCategory').textContent = project.category;
            document.getElementById('modalDescription').innerHTML = project.description;

            document.getElementById('modalImage').src = getImageSrc(project.image);

            // show video if present
            const videoContainer = document.getElementById('modalVideo');
            if (videoContainer) {
                if (project.video) {
                    videoContainer.style.display = 'block';
                    videoContainer.innerHTML = createEmbedForVideo(project.video, 360);
                } else {
                    videoContainer.style.display = 'none';
                    videoContainer.innerHTML = '';
                }
            }

            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }
    };

    function createEmbedForVideo(url, height = 360) {
        if (!url) return '';
        const u = url.trim();
        const ytMatch = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
        if (ytMatch && ytMatch[1]) {
            const id = ytMatch[1];
            return `<div class="video-embed" style="width:100%;"><iframe width="100%" height="${height}" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        if (u.match(/\.mp4(\?|$)/i)) {
            return `<div class="video-embed" style="width:100%;"><video controls style="width:100%; max-height:${height}px;"> <source src="${u}" type="video/mp4">Your browser does not support the video tag.</video></div>`;
        }
        const vimeo = u.match(/vimeo\.com\/(\d+)/);
        if (vimeo && vimeo[1]) {
            return `<div class="video-embed" style="width:100%;"><iframe width="100%" height="${height}" src="https://player.vimeo.com/video/${vimeo[1]}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        return `<div class="video-embed"><a href="${u}" target="_blank">Open video</a></div>`;
    }

    // Close Modal Logic
    document.querySelector('.close-modal').addEventListener('click', closeModal);
    window.addEventListener('click', function (event) {
        const modal = document.getElementById('projectModal');
        if (event.target == modal) {
            closeModal();
        }
    });

    function closeModal() {
        const modal = document.getElementById('projectModal');
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function setupAdminLink(data) {
        // This is a placeholder for the "Admin" requirement.
        // In a real app, this would be a login button or hidden link.
        console.log("Projects loaded. Admin ready.");
    }
    // Check URL hash for direct project linking
    const handleHash = () => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#project-')) {
            const projectId = parseInt(hash.replace('#project-', ''));
            if (!isNaN(projectId)) {
                // Small delay to ensure modal logic is ready and data is fetched
                setTimeout(() => openProjectModal(projectId), 300);
            }
        }
    };

    // Run on load
    handleHash();

    // Floating Phone Logic
    const floatingPhone = document.getElementById('floatingPhone');
    const modal = document.getElementById('projectModal');

    const checkScroll = () => {
        const projectCategories = document.querySelectorAll('.project-category');
        const windowHeight = window.innerHeight;
        let showButton = false;

        projectCategories.forEach(cat => {
            const rect = cat.getBoundingClientRect();
            // If the bottom of any category has been reached/passed
            if (rect.bottom < windowHeight + 100) {
                showButton = true;
            }
        });

        // Fallback: Near page bottom
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
            showButton = true;
        }

        if (showButton) {
            floatingPhone.classList.add('show');
        }
    };

    if (floatingPhone) {
        window.addEventListener('scroll', checkScroll);

        // Also check inside modal if it's open
        if (modal) {
            modal.addEventListener('scroll', function () {
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    const rect = modalContent.getBoundingClientRect();
                    // If modal is scrolled near the bottom
                    if (modal.scrollTop + modal.offsetHeight >= modal.scrollHeight - 50) {
                        floatingPhone.classList.add('show');
                    }
                }
            });
        }
    }
});
