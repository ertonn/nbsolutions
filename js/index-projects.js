document.addEventListener('DOMContentLoaded', function () {
    fetch('js/projects-data.json')
        .then(response => response.json())
        .then(projects => {
            const projectsList = document.querySelector('.projects-list');
            if (!projectsList) return;

            // Shuffle and pick 2 projects
            const shuffled = projects.sort(() => 0.5 - Math.random());
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
                        <img src="${project.image}" alt="${project.title}">
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
        })
        .catch(error => console.error('Error fetching projects:', error));

    // Floating Phone Logic
    const floatingPhone = document.getElementById('floatingPhone');
    const projectsSection = document.querySelector('.projects');

    if (floatingPhone && projectsSection) {
        window.addEventListener('scroll', function () {
            const sectionRect = projectsSection.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            // Show when the bottom of the projects section is reached 
            // or when we're near the bottom of the page
            if (sectionRect.bottom < windowHeight || (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                floatingPhone.classList.add('show');
            } else {
                floatingPhone.classList.remove('show');
            }
        });
    }
});
