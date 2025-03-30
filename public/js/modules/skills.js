/**
 * Skills tab functionality for the ArtifactsMMO Client
 * Manages fetching and displaying character skills data
 */

// Function to fetch character skills data
async function fetchCharacterSkills() {
    // Show loading spinner
    document.getElementById('skills-loading').style.display = 'flex';
    document.getElementById('skills-table-container').style.display = 'none';
    
    try {
        // Use the characters list from the global variable
        if (!window.charactersList || window.charactersList.length === 0) {
            throw new Error('No characters available. Please refresh the page.');
        }
        
        // Prepare to fetch details for each character
        const skillsData = [];
        const fetchPromises = [];
        
        // Create a promise for each character's details
        for (const name of window.charactersList) {
            if (!name) continue;
            
            const fetchPromise = fetch(`/api/character/${encodeURIComponent(name)}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch details for ${name}: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Extract character data from API response
                    // The API returns a data array containing character objects, or a single character object
                    let character = null;
                    
                    // Handle different API response formats
                    if (data.data) {
                        // If data.data is an array, find the character in the array
                        if (Array.isArray(data.data)) {
                            character = data.data.find(char => char && char.name === name);
                        } 
                        // If data.data is a single object (not array), check if it's the character we want
                        else if (typeof data.data === 'object' && data.data.name === name) {
                            character = data.data;
                        }
                    } 
                    // If data itself is the character object
                    else if (data.name === name) {
                        character = data;
                    }
                    
                    if (!character) {
                        console.error(`Character data format:`, data);
                        throw new Error(`Character ${name} not found in the API response`);
                    }
                    
                    // Extract skill levels directly from the character data
                    // The API uses the format <skill_name>_level
                    const characterSkills = {
                        name: name,
                        level: character.level || 0,
                        combat: character.level || 0, // Combat level is the character level
                        mining: character.mining_level || 0,
                        woodcutting: character.woodcutting_level || 0,
                        fishing: character.fishing_level || 0,
                        weaponcrafting: character.weaponcrafting_level || 0,
                        gearcrafting: character.gearcrafting_level || 0,
                        jewelrycrafting: character.jewelrycrafting_level || 0,
                        cooking: character.cooking_level || 0,
                        alchemy: character.alchemy_level || 0
                    };
                    
                    skillsData.push(characterSkills);
                })
                .catch(err => {
                    console.error(`Error fetching data for ${name}:`, err);
                    // Add character with error state
                    skillsData.push({
                        name: name,
                        level: 0,
                        combat: 0,
                        mining: 0,
                        woodcutting: 0,
                        fishing: 0,
                        weaponcrafting: 0,
                        gearcrafting: 0,
                        jewelrycrafting: 0,
                        cooking: 0,
                        alchemy: 0,
                        error: true
                    });
                });
            
            fetchPromises.push(fetchPromise);
        }
        
        // Wait for all fetch operations to complete
        await Promise.all(fetchPromises);
        
        // If no skills data was retrieved, use mock data
        if (skillsData.length === 0) {
            // Fallback to mock data for testing
            console.log('No skill data available, using mock data');
            for (const name of window.charactersList) {
                if (!name) continue;
                
                skillsData.push({
                    name: name,
                    level: Math.floor(Math.random() * 40) + 1,
                    combat: Math.floor(Math.random() * 40) + 1,
                    mining: Math.floor(Math.random() * 40) + 1,
                    woodcutting: Math.floor(Math.random() * 40) + 1,
                    fishing: Math.floor(Math.random() * 40) + 1,
                    weaponcrafting: Math.floor(Math.random() * 40) + 1,
                    gearcrafting: Math.floor(Math.random() * 40) + 1,
                    jewelrycrafting: Math.floor(Math.random() * 40) + 1,
                    cooking: Math.floor(Math.random() * 40) + 1,
                    alchemy: Math.floor(Math.random() * 40) + 1
                });
            }
        }
        
        // Render the skills table with the collected data
        renderSkillsTable(skillsData);
        
    } catch (error) {
        console.error('Error fetching skills data:', error);
        // Show error in table container
        document.getElementById('skills-loading').innerHTML = 
            `<div class="error-message">Error loading skills data: ${error.message}</div>`;
    }
}

// Function to render the skills table
function renderSkillsTable(skillsData) {
    const tableBody = document.getElementById('skills-table-body');
    tableBody.innerHTML = '';
    
    // Sort characters by name
    skillsData.sort((a, b) => a.name.localeCompare(b.name));
    
    // Create rows for each character
    skillsData.forEach(character => {
        const row = document.createElement('tr');
        
        // Character name cell
        const nameCell = document.createElement('td');
        nameCell.textContent = character.name;
        
        // Mark characters with fetch errors
        if (character.error) {
            nameCell.innerHTML = `${character.name} <span class="error-badge" title="Failed to fetch data">!</span>`;
            nameCell.classList.add('error-name');
            row.classList.add('error-row');
        }
        
        row.appendChild(nameCell);
        
        // Add skill cells
        addSkillCell(row, character.level, character.error);              // Character Level
        addSkillCell(row, character.combat, character.error);             // Combat
        addSkillCell(row, character.mining, character.error);             // Mining
        addSkillCell(row, character.woodcutting, character.error);        // Woodcutting
        addSkillCell(row, character.fishing, character.error);            // Fishing
        addSkillCell(row, character.weaponcrafting, character.error);     // Weapon Crafting
        addSkillCell(row, character.gearcrafting, character.error);       // Gear Crafting
        addSkillCell(row, character.jewelrycrafting, character.error);    // Jewelry Crafting
        addSkillCell(row, character.cooking, character.error);            // Cooking
        addSkillCell(row, character.alchemy, character.error);            // Alchemy
        
        tableBody.appendChild(row);
    });
    
    // Hide loading spinner and show table
    document.getElementById('skills-loading').style.display = 'none';
    document.getElementById('skills-table-container').style.display = 'block';
}

// Helper function to create a skill cell with color based on level
function addSkillCell(row, level, hasError = false) {
    const cell = document.createElement('td');
    const skillCell = document.createElement('div');
    skillCell.className = 'skill-cell';
    
    // Handle error state or no skill data
    if (hasError) {
        skillCell.textContent = '?';
        skillCell.classList.add('skill-error');
        skillCell.title = 'Data unavailable';
    } else {
        skillCell.textContent = level || 0;
        
        // Determine color class based on level (1-40)
        // If level is 0, it means the skill doesn't exist for this character
        let colorClass;
        if (level === 0) {
            colorClass = 'skill-none';
            skillCell.title = 'Skill not trained';
        } else if (level <= 8) {
            colorClass = 'skill-level-1';
        } else if (level <= 16) {
            colorClass = 'skill-level-2';
        } else if (level <= 24) {
            colorClass = 'skill-level-3';
        } else if (level <= 32) {
            colorClass = 'skill-level-4';
        } else {
            colorClass = 'skill-level-5';
        }
        
        skillCell.classList.add(colorClass);
    }
    
    cell.appendChild(skillCell);
    row.appendChild(cell);
}

// Initialize skills tab functionality
function initSkillsTab() {
    // Add event listener to the skills tab to fetch data when opened
    const skillsTabButton = Array.from(document.getElementsByClassName('tab-button'))
        .find(btn => btn.textContent.trim() === 'Skills');
            
    if (skillsTabButton) {
        // Don't add a second click handler if there's already an onclick
        if (!skillsTabButton.hasAttribute('onclick')) {
            skillsTabButton.addEventListener('click', fetchCharacterSkills);
        } else {
            // For elements with an onclick attribute, we'll fetch when tab is activated
            const originalOnclick = skillsTabButton.getAttribute('onclick');
            skillsTabButton.setAttribute('onclick', originalOnclick + '; SkillsModule.fetchSkills();');
        }
    }
    
    // Also check if skills tab is currently active and load data if it is
    if (document.getElementById('skills') && 
        document.getElementById('skills').classList.contains('active')) {
        setTimeout(fetchCharacterSkills, 500);
    }
}

// Export the module functions
window.SkillsModule = {
    init: initSkillsTab,
    fetchSkills: fetchCharacterSkills
};