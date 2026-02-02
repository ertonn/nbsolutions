document.addEventListener('DOMContentLoaded', function () {
    const STORAGE_KEY = "nb_projects_data";

    // Helper to get image source (checks localStorage for base64, otherwise uses path)
    function getImageSrc(imagePath) {
        if (!imagePath) return '';
        const filename = imagePath.split('/').pop();
        const storedImage = localStorage.getItem(`img_${filename}`);
        return storedImage || imagePath;
    }

    function renderIndexProjects(projects) {
        const projectsList = document.querySelector('.projects-list');
        if (!projectsList) return;

        // Shuffle and pick 2 projects
        const shuffled = [...projects].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 2);

        // Clear existing projects
        projectsList.innerHTML = '';

        selected.forEach((project, index) => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item' + (index % 2 !== 0 ? ' flipped' : '');

            // Extract a plain text version of the description if it's HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = project.description;
            const plainDescription = tempDiv.innerText || tempDiv.textContent;
            // Truncate description for the index page if needed
            const truncatedDescription = plainDescription.length > 200 ? plainDescription.substring(0, 197) + '...' : plainDescription;

            projectItem.innerHTML = `
                <div class="project-media">
                    <img src="${getImageSrc(project.image)}" alt="${project.title}">
                </div>
                <div class="project-content">
                    <h3 class="project-title">${project.title}</h3>
                    <p class="project-description">${truncatedDescription}</p>
                    <div class="project-details">
                        <div class="detail-item">
                            <span class="detail-label">Client</span>
                            <span class="detail-value">${project.client}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Date</span>
                            <span class="detail-value">${project.year}</span>
                        </div>
                    </div>
                    <a href="projects.html#project-${project.id}" class="project-link">View Details</a>
                </div>
            `;
            projectsList.appendChild(projectItem);
        });
    }

    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        renderIndexProjects(JSON.parse(localData));
    } else {
        fetch('js/projects-data.json')
            .then(response => response.json())
            .then(projects => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
                renderIndexProjects(projects);
            })
            .catch(error => console.error('Error fetching projects:', error));
    }

    // Floating Phone Logic
    const floatingPhone = document.getElementById('floatingPhone');
    const projectsSection = document.querySelector('.projects');

    if (floatingPhone) {
        window.addEventListener('scroll', function () {
            const projectItems = document.querySelectorAll('.project-item');
            const windowHeight = window.innerHeight;
            let showButton = false;

            projectItems.forEach(item => {
                const rect = item.getBoundingClientRect();
                // If the bottom of any project item is visible or passed
                if (rect.bottom < windowHeight) {
                    showButton = true;
                }
            });

            // Fallback: Also show when near the true bottom of the page
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                showButton = true;
            }

            if (showButton) {
                floatingPhone.classList.add('show');
            }
        });
    }
});
