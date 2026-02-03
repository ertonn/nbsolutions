document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = "nb_projects_data";

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

            modal.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        }
    };

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
