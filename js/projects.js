document.addEventListener('DOMContentLoaded', function () {
    // Load projects from JSON file
    fetch('js/projects-data.json')
        .then(response => response.json())
        .then(data => {
            renderProjects(data);
            setupAdminLink(data);
        })
        .catch(error => {
            console.error('Error loading projects:', error);
            // Fallback content if fetch fails (e.g., local testing without server)
            // You might want to include the data directly here if file system access is restricted
        });

    function renderProjects(projects) {
        // Group projects by category
        const categories = {};
        projects.forEach(project => {
            if (!categories[project.category]) {
                categories[project.category] = [];
            }
            categories[project.category].push(project);
        });

        const projectsContainer = document.querySelector('.projects-container');
        // Clear existing static content if we want to replace it entirely
        // projectsContainer.innerHTML = ''; 

        // Or, since the user might want to keep the structure, let's target the grids
        // But the HTML structure is currently hardcoded categories. 
        // Best approach: dynamic rendering of the whole list to support "Add/Remove".

        projectsContainer.innerHTML = ''; // Start fresh

        for (const [categoryName, categoryProjects] of Object.entries(categories)) {
            const categorySection = document.createElement('div');
            categorySection.className = 'project-category';

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
                card.innerHTML = `
                    <div class="card-image-wrapper">
                        <img src="${project.image}" alt="${project.title}" loading="lazy">
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
        fetch('js/projects-data.json')
            .then(response => response.json())
            .then(projects => {
                const project = projects.find(p => p.id === projectId);
                if (project) {
                    const modal = document.getElementById('projectModal');

                    // Populate Modal Data
                    document.getElementById('modalTitle').textContent = project.title;
                    document.getElementById('modalCategory').textContent = project.category;
                    document.getElementById('modalDescription').innerHTML = project.description;
                    document.getElementById('modalClient').textContent = project.client;
                    document.getElementById('modalYear').textContent = project.year;

                    document.getElementById('modalImage').src = project.image;

                    modal.classList.add('show');
                    document.body.style.overflow = 'hidden'; // Prevent scrolling
                }
            });
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
});
