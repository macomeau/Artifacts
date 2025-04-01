/**
 * Task functions for the ArtifactsMMO Client
 * Handles task-specific functionality like crafting, cooking, and combat
 */

// Show the leather boots crafting form
function showLeatherBootsCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Added adventurer boots form
    showForm('leather-boots-crafting-form', formIds, 'leather-boots-character', 'Leather Boots Crafting');
}

// Start the leather boots crafting process
function startLeatherBootsCrafting() {
    const character = document.getElementById('leather-boots-character').value;
    
    console.log(`Starting leather boots crafting with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for Leather Boots crafting', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('leather-boots-crafting-loop.js', args);
    document.getElementById('leather-boots-crafting-form').style.display = 'none';
}

// Show the iron sword crafting form
function showIronSwordCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Added adventurer boots form
    showForm('iron-sword-crafting-form', formIds, 'iron-sword-character', 'Iron Sword Crafting');
}

// Start the iron sword crafting process
function startIronSwordCrafting() {
    const character = document.getElementById('iron-sword-character').value;
    
    console.log(`Starting iron sword crafting with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for Iron Sword crafting', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('iron-sword-crafting-loop.js', args);
    document.getElementById('iron-sword-crafting-form').style.display = 'none';
}

// Show the iron dagger crafting form
function showIronDaggerCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Added adventurer boots form
    showForm('iron-dagger-crafting-form', formIds, 'iron-dagger-character', 'Iron Dagger Crafting');
}

// Start the iron dagger crafting process
function startIronDaggerCrafting() {
    const character = document.getElementById('iron-dagger-character').value;
    const quantity = document.getElementById('iron-dagger-quantity').value;
    
    console.log(`Starting iron dagger crafting with character: ${character}, quantity: ${quantity}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for Iron Dagger crafting', true);
        return;
    }
    
    // Always pass the character name and quantity explicitly
    const args = [character, quantity];
    
    window.ProcessesModule.startScript('iron-dagger-crafting-loop.js', args);
    document.getElementById('iron-dagger-crafting-form').style.display = 'none';
}


// Start combat at the specified coordinates
function startCombat() {
    const x = document.getElementById('combat-x').value;
    const y = document.getElementById('combat-y').value;
    const character = document.getElementById('combat-character').value;
    
    // Validate inputs
    if (!x || !y) {
        window.CharactersModule.showNotification('Please enter coordinates for combat', true);
        return;
    }
    
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for combat', true);
        return;
    }
    
    // Build arguments array
    const args = [`(${x},${y})`, character];
    
    window.ProcessesModule.startScript('go-fight-heal-loop.js', args);
}

// Start mining at the selected location
function startMining() {
    const character = document.getElementById('mining-character').value;
    const location = document.getElementById('mining-location').value;
    
    // Validate inputs
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for mining', true);
        return;
    }
    
    if (!location) {
        window.CharactersModule.showNotification('Please select a mining location', true);
        return;
    }
    
    // Map location to script name
    let scriptName;
    switch (location) {
        case 'copper':
            scriptName = 'copper-mining-loop.js';
            break;
        case 'iron':
            scriptName = 'iron-mining-loop.js';
            break;
        case 'coal':
            scriptName = 'coal-mining-loop.js';
            break;
        case 'gold':
            scriptName = 'gold-mining-loop.js';
            break;
        default:
            window.CharactersModule.showNotification('Invalid mining location', true);
            return;
    }
    
    // Start the mining script with the character
    window.ProcessesModule.startScript(scriptName, [character]);
    document.getElementById('mining-form').style.display = 'none';
}

// Show the copper mining form
function showCopperMiningForm() {
    const formIds = ['copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form', 'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form', 'iron-bar-crafting-form', 'mithril-mining-form'];
    showForm('copper-mining-form', formIds, 'copper-mining-character', 'Copper Mining');
}

// Start the copper mining process
function startCopperMining() {
    safelyStartScript(
        'copper-mining-form',
        'copper-mining-character',
        'copper-mining-loop.js',
        'copper mining',
        () => {
            const processOption = document.getElementById('copper-mining-process').value;
            return [processOption];
        }
    );
}

// Show the iron mining form
function showIronMiningForm() {
    const formIds = ['copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form', 'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form', 'iron-bar-crafting-form', 'mithril-mining-form'];
    showForm('iron-mining-form', formIds, 'iron-mining-character', 'Iron Mining');
}

// Start the iron mining process
function startIronMining() {
    safelyStartScript(
        'iron-mining-form',
        'iron-mining-character',
        'iron-mining-loop.js',
        'iron mining',
        () => {
            const processOption = document.getElementById('iron-mining-process').value;
            return [processOption];
        }
    );
}

// Show the coal mining form
function showCoalMiningForm() {
    const formIds = ['copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form', 'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form', 'iron-bar-crafting-form', 'mithril-mining-form'];
    showForm('coal-mining-form', formIds, 'coal-mining-character', 'Coal Mining');
}

// Start the coal mining process
function startCoalMining() {
    safelyStartScript(
        'coal-mining-form',
        'coal-mining-character',
        'coal-mining-loop.js',
        'coal mining',
        () => {
            const processOption = document.getElementById('coal-mining-process').value;
            return [processOption];
        }
    );
}

// Show the gold mining form
function showGoldMiningForm() {
    const formIds = ['copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form', 'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form', 'iron-bar-crafting-form', 'mithril-mining-form'];
    showForm('gold-mining-form', formIds, 'gold-mining-character', 'Gold Mining');
}

// Start the gold mining process
function startGoldMining() {
    safelyStartScript(
        'gold-mining-form',
        'gold-mining-character',
        'gold-mining-loop.js',
        'gold mining',
        () => {
            const processOption = document.getElementById('gold-mining-process').value;
            return [processOption];
        }
    );
}

// Show the steel crafting form
function showSteelCraftingForm() {
    const formIds = ['copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form', 'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form', 'iron-bar-crafting-form', 'mithril-mining-form'];
    showForm('steel-crafting-form', formIds, 'steel-crafting-character', 'Steel Bar Crafting');
}

// Start the steel bar crafting process
function startSteelCrafting() {
    safelyStartScript(
        'steel-crafting-form',
        'steel-crafting-character',
        'steel-bar-crafting-loop.js',
        'steel bar crafting'
    );
}

// Show the ash harvesting form
function showAshHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('ash-harvesting-form', formIds, 'ash-harvesting-character', 'Ash Harvesting');
}

// Start the ash harvesting process
function startAshHarvesting() {
    safelyStartScript(
        'ash-harvesting-form',
        'ash-harvesting-character',
        'ash-harvesting-loop.js',
        'ash harvesting',
        () => {
            const processOption = document.getElementById('ash-harvesting-process').value;
            return [processOption];
        }
    );
}

// Show the birch harvesting form
function showBirchHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('birch-harvesting-form', formIds, 'birch-harvesting-character', 'Birch Harvesting');
}

// Start the birch harvesting process
function startBirchHarvesting() {
    safelyStartScript(
        'birch-harvesting-form',
        'birch-harvesting-character',
        'birch-harvesting-loop.js',
        'birch harvesting',
        () => {
            const processOption = document.getElementById('birch-harvesting-process').value;
            return [processOption];
        }
    );
}

// Show the spruce harvesting form
function showSpruceHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('spruce-harvesting-form', formIds, 'spruce-harvesting-character', 'Spruce Harvesting');
}

// Start the spruce harvesting process
function startSpruceHarvesting() {
    safelyStartScript(
        'spruce-harvesting-form',
        'spruce-harvesting-character',
        'spruce-harvesting-loop.js',
        'spruce harvesting',
        () => {
            const processOption = document.getElementById('spruce-harvesting-process').value;
            return [processOption];
        }
    );
}

// Show the maple harvesting form
function showMapleHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('maple-harvesting-form', formIds, 'maple-harvesting-character', 'Maple Harvesting');
}

// Start the maple harvesting process
function startMapleHarvesting() {
    safelyStartScript(
        'maple-harvesting-form',
        'maple-harvesting-character',
        'maple-harvesting-loop.js',
        'maple harvesting',
        () => {
            const processOption = document.getElementById('maple-harvesting-process').value;
            return [processOption];
        }
    );
}

// Show the deadwood harvesting form
function showDeadwoodHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('deadwood-harvesting-form', formIds, 'deadwood-harvesting-character', 'Deadwood Harvesting');
}

// Start the deadwood harvesting process
function startDeadwoodHarvesting() {
    safelyStartScript(
        'deadwood-harvesting-form',
        'deadwood-harvesting-character',
        'deadwood-harvesting-loop.js',
        'deadwood harvesting',
        () => {
            const processOption = document.getElementById('deadwood-harvesting-process').value;
            return [processOption];
        }
    );
}

// Show the hardwood plank crafting form
function showHardwoodPlankCraftingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Added strange wood
    showForm('hardwood-plank-crafting-form', formIds, 'hardwood-plank-character', 'Hardwood Plank Crafting');
}

// Start the hardwood plank crafting process
function startHardwoodPlankCrafting() {
    safelyStartScript(
        'hardwood-plank-crafting-form',
        'hardwood-plank-character',
        'hardwood-plank-crafting-loop.js',
        'hardwood plank crafting'
    );
}

// Show the strange wood harvesting form
function showStrangeWoodHarvestingForm() {
    const formIds = ['ash-harvesting-form', 'birch-harvesting-form', 'spruce-harvesting-form', 'maple-harvesting-form', 'deadwood-harvesting-form', 'hardwood-plank-crafting-form', 'strange-wood-harvesting-form']; // Include self
    showForm('strange-wood-harvesting-form', formIds, 'strange-wood-harvesting-character', 'Strange Wood Harvesting');
}

// Start the strange wood harvesting process
function startStrangeWoodHarvesting() {
    safelyStartScript(
        'strange-wood-harvesting-form',
        'strange-wood-harvesting-character',
        'strange-wood-harvesting-loop.js',
        'strange wood harvesting',
        () => {
            // This function provides the extra arguments (coordinates)
            const coordsInput = document.getElementById('strange-wood-harvesting-coords').value;
            
            // Validate coordinates format
            const coordsMatch = coordsInput.match(/\s*(-?\d+)\s*,\s*(-?\d+)\s*/);
            if (!coordsMatch) {
                if (window.CharactersModule && CharactersModule.showNotification) {
                    window.CharactersModule.showNotification('Please enter valid coordinates in format "X,Y"', true);
                }
                return null; // Indicate failure to get args
            }
            
            const woodX = parseInt(coordsMatch[1]);
            const woodY = parseInt(coordsMatch[2]);
            
            // Format coordinates as a string for script arguments, e.g., "(X,Y)"
            const coordsArg = `(${woodX},${woodY})`;
            
            return [coordsArg]; // Return coordinates as the first extra argument
        }
    );
}

// Show the shrimp harvesting form
function showShrimpHarvestingForm() {
    const formIds = ['shrimp-harvesting-form', 'gudgeon-harvesting-form', 'trout-harvesting-form', 'bass-harvesting-form', 'salmon-harvesting-form']; // Added salmon
    showForm('shrimp-harvesting-form', formIds, 'shrimp-harvesting-character', 'Shrimp Fishing');
}

// Start the shrimp harvesting process
function startShrimpHarvesting() {
    safelyStartScript(
        'shrimp-harvesting-form',
        'shrimp-harvesting-character',
        'shrimp-harvesting-loop.js',
        'shrimp fishing'
    );
}

// Show the gudgeon harvesting form
function showGudgeonHarvestingForm() {
    const formIds = ['shrimp-harvesting-form', 'gudgeon-harvesting-form', 'trout-harvesting-form', 'bass-harvesting-form', 'salmon-harvesting-form']; // Added salmon
    showForm('gudgeon-harvesting-form', formIds, 'gudgeon-harvesting-character', 'Gudgeon Fishing');
}

// Start the gudgeon harvesting process
function startGudgeonHarvesting() {
    safelyStartScript(
        'gudgeon-harvesting-form',
        'gudgeon-harvesting-character',
        'gudgeon-harvesting-loop.js',
        'gudgeon fishing'
    );
}

// Show the trout harvesting form
function showTroutHarvestingForm() {
    const formIds = ['shrimp-harvesting-form', 'gudgeon-harvesting-form', 'trout-harvesting-form', 'bass-harvesting-form', 'salmon-harvesting-form']; // Added salmon
    showForm('trout-harvesting-form', formIds, 'trout-harvesting-character', 'Trout Fishing');
}

// Start the trout harvesting process
function startTroutHarvesting() {
    safelyStartScript(
        'trout-harvesting-form',
        'trout-harvesting-character',
        'trout-harvesting-loop.js',
        'trout fishing'
    );
}

// Show the bass harvesting form
function showBassHarvestingForm() {
    const formIds = ['shrimp-harvesting-form', 'gudgeon-harvesting-form', 'trout-harvesting-form', 'bass-harvesting-form', 'salmon-harvesting-form']; // Added salmon
    showForm('bass-harvesting-form', formIds, 'bass-harvesting-character', 'Bass Fishing');
}

// Start the bass harvesting process
function startBassHarvesting() {
    safelyStartScript(
        'bass-harvesting-form',
        'bass-harvesting-character',
        'bass-harvesting-loop.js',
        'bass fishing'
    );
}

// Show the salmon harvesting form
function showSalmonHarvestingForm() {
    const formIds = ['shrimp-harvesting-form', 'gudgeon-harvesting-form', 'trout-harvesting-form', 'bass-harvesting-form', 'salmon-harvesting-form']; // Include self
    showForm('salmon-harvesting-form', formIds, 'salmon-harvesting-character', 'Salmon Fishing');
}

// Start the salmon harvesting process
function startSalmonHarvesting() {
    safelyStartScript(
        'salmon-harvesting-form',
        'salmon-harvesting-character',
        'salmon-harvesting-loop.js',
        'salmon fishing'
    );
}

// Show the minor health potion form
function showMinorHealthPotionForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('minor-health-potion-form', formIds, 'minor-health-potion-character', 'Minor Health Potion Crafting');
}

// Show the health potion form
function showHealthPotionForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('health-potion-form', formIds, 'health-potion-character', 'Health Potion Crafting');
}

// Start the minor health potion crafting process
function startMinorHealthPotionCrafting() {
    safelyStartScript(
        'minor-health-potion-form',
        'minor-health-potion-character',
        'minor-health-potion-loop.js',
        'minor health potion crafting'
    );
}

// Start the health potion crafting process
function startHealthPotionCrafting() {
    safelyStartScript(
        'health-potion-form',
        'health-potion-character',
        'health-potion-loop.js',
        'health potion crafting'
    );
}

// Show the air boost potion form
function showAirBoostPotionForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('air-boost-potion-form', formIds, 'air-boost-potion-character', 'Air Boost Potion Crafting');
}

// Start the air boost potion crafting process
function startAirBoostPotionCrafting() {
    safelyStartScript(
        'air-boost-potion-form',
        'air-boost-potion-character',
        'air-boost-potion-loop.js',
        'air boost potion crafting'
    );
}

// Show the nettle harvesting form
function showNettleHarvestingForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('nettle-harvesting-form', formIds, 'nettle-harvesting-character', 'Nettle Harvesting');
}

// Start the nettle harvesting process
function startNettleHarvesting() {
    safelyStartScript(
        'nettle-harvesting-form',
        'nettle-harvesting-character',
        'nettle-harvesting-loop.js',
        'nettle harvesting'
    );
}

// Show the sunflower harvesting form
function showSunflowerHarvestingForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('sunflower-harvesting-form', formIds, 'sunflower-harvesting-character', 'Sunflower Harvesting');
}

// Show the glowstem harvesting form
function showGlowstemHarvestingForm() {
    const formIds = ['minor-health-potion-form', 'health-potion-form', 'air-boost-potion-form', 'nettle-harvesting-form', 'sunflower-harvesting-form', 'glowstem-harvesting-form'];
    showForm('glowstem-harvesting-form', formIds, 'glowstem-harvesting-character', 'Glowstem Harvesting');
}

// Start the sunflower harvesting process
function startSunflowerHarvesting() {
    safelyStartScript(
        'sunflower-harvesting-form',
        'sunflower-harvesting-character',
        'sunflower-harvesting-loop.js',
        'sunflower harvesting'
    );
}

// Start the glowstem harvesting process
function startGlowstemHarvesting() {
    safelyStartScript(
        'glowstem-harvesting-form',
        'glowstem-harvesting-character',
        'glowstem-harvesting-loop.js',
        'glowstem harvesting'
    );
}

/**
 * Helper function to safely start a script with proper character validation
 * @param {string} formId - The ID of the form to hide after starting
 * @param {string} dropdownId - The ID of the character dropdown
 * @param {string} scriptName - The name of the script to start
 * @param {string} taskDescription - User-friendly description of the task for error messages
 * @param {Function} extraArgsProvider - Optional function that returns additional arguments beyond character name
 */
function safelyStartScript(formId, dropdownId, scriptName, taskDescription, extraArgsProvider = null) {
    const formElement = document.getElementById(formId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!dropdown) {
        console.error(`Character dropdown ${dropdownId} not found`);
        if (window.CharactersModule && CharactersModule.showNotification) {
            window.CharactersModule.showNotification(`Error: Character dropdown not found. Please refresh the page.`, true);
        }
        return;
    }
    
    const character = dropdown.value;
    console.log(`Starting ${taskDescription} with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        if (window.CharactersModule && CharactersModule.showNotification) {
            window.CharactersModule.showNotification(`Please select a character for ${taskDescription}`, true);
        } else {
            console.error(`No character selected for ${taskDescription}`);
        }
        return;
    }
    
    // Build arguments array, starting with character name
    const args = [character];
    
    // Add any extra arguments if provided
    if (extraArgsProvider) {
        const extraArgs = extraArgsProvider();
        if (Array.isArray(extraArgs)) {
            args.push(...extraArgs);
        }
    }
    
    // Start the script
    if (window.ProcessesModule && ProcessesModule.startScript) {
        window.ProcessesModule.startScript(scriptName, args);
    } else {
        console.error('ProcessesModule not available for starting scripts');
        if (window.CharactersModule && CharactersModule.showNotification) {
            window.CharactersModule.showNotification('Error: Process module not loaded. Please refresh the page.', true);
        }
        return;
    }
    
    // Hide the form
    if (formElement) {
        formElement.style.display = 'none';
    }
}

/**
 * Helper function to show a specific form and hide others
 * @param {string} formToShowId - The ID of the form to show
 * @param {string[]} formIds - Array of all form IDs that should be hidden
 * @param {string} dropdownId - The ID of the character dropdown to populate
 * @param {string} formDescription - User-friendly description of the form for error messages
 * @returns {boolean} - True if successful, false if form not found
 */
function showForm(formToShowId, formIds, dropdownId, formDescription) {
    // Hide all forms first
    formIds.forEach(id => {
        const form = document.getElementById(id);
        if (form) {
            form.style.display = 'none';
        }
    });
    
    // Show the requested form
    const formToShow = document.getElementById(formToShowId);
    if (!formToShow) {
        console.error(`${formDescription} form element not found in the DOM`);
        if (window.CharactersModule && CharactersModule.showNotification) {
            window.CharactersModule.showNotification(`Error: ${formDescription} form not found. Please refresh the page.`, true);
        } else {
            console.error('CharactersModule not available for notifications');
        }
        return false;
    }
    
    // Show the form
    formToShow.style.display = 'block';
    
    // Populate the character dropdown
    updateCharacterDropdown(dropdownId);
    
    return true;
}

// Helper function to update character dropdowns
function updateCharacterDropdown(elementId) {
    // Check if we have characters available
    if (window.charactersList && window.charactersList.length > 0) {
        const select = document.getElementById(elementId);
        if (select) {
            // Force repopulation of the dropdown
            let characterOptions = '<option value="">Select a character</option>';
            window.charactersList.forEach(name => {
                if (name) {
                    characterOptions += `<option value="${name}">${name}</option>`;
                }
            });
            select.innerHTML = characterOptions;
        }
    }
}

// Initialize task functionality
function initTasks() {
    // Attach event listeners to character dropdowns
    const characterDropdowns = document.querySelectorAll('[data-character-dropdown]');
    for (let i = 0; i < characterDropdowns.length; i++) {
        const dropdown = characterDropdowns[i];
        
        // Mark this dropdown to be populated by the CharactersModule
        if (!dropdown.hasAttribute('data-character-dropdown-initialized')) {
            dropdown.setAttribute('data-character-dropdown-initialized', 'true');
        }
    }
}

// Show the cook trout form
function showCookTroutForm() {
    // Use the generic form handling helper
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Added shrimp, gudgeon
    showForm('cook-trout-form', formIds, 'cook-trout-character', 'Cook Trout');
}

// Start the cook trout process
function startCookTrout() {
    const character = document.getElementById('cook-trout-character').value;
    
    console.log(`Starting trout cooking with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for cooking trout', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('cook-trout-loop.js', args);
    document.getElementById('cook-trout-form').style.display = 'none';
}

// Show the cook wolf meat form
function showCookWolfMeatForm() {
    // Use the generic form handling helper
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Added shrimp, gudgeon
    showForm('cook-wolf-meat-form', formIds, 'cook-wolf-meat-character', 'Cook Wolf Meat');
}

// Start the cook wolf meat process
function startCookWolfMeat() {
    const character = document.getElementById('cook-wolf-meat-character').value;
    
    console.log(`Starting wolf meat cooking with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for cooking wolf meat', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('cook-wolf-meat-loop.js', args);
    document.getElementById('cook-wolf-meat-form').style.display = 'none';
}

// Show the cook bass form
function showCookBassForm() {
    // Use the generic form handling helper
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Added shrimp, gudgeon
    showForm('cook-bass-form', formIds, 'cook-bass-character', 'Cook Bass');
}

// Start the cook bass process
function startCookBass() {
    const character = document.getElementById('cook-bass-character').value;
    
    console.log(`Starting bass cooking with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for cooking bass', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('cook-bass-loop.js', args);
    document.getElementById('cook-bass-form').style.display = 'none';
}

// Show the cook salmon form
function showCookSalmonForm() {
    // Use the generic form handling helper
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Added shrimp, gudgeon
    showForm('cook-salmon-form', formIds, 'cook-salmon-character', 'Cook Salmon');
}

// Start the cook salmon process
function startCookSalmon() {
    safelyStartScript(
        'cook-salmon-form',
        'cook-salmon-character',
        'cook-salmon-loop.js',
        'salmon cooking'
    );
}

// Show the cook shrimp form
function showCookShrimpForm() {
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Include self
    showForm('cook-shrimp-form', formIds, 'cook-shrimp-character', 'Cook Shrimp');
}

// Start the cook shrimp process
function startCookShrimp() {
    safelyStartScript(
        'cook-shrimp-form',
        'cook-shrimp-character',
        'cook-shrimp-loop.js',
        'shrimp cooking'
    );
}

// Show the cook gudgeon form
function showCookGudgeonForm() {
    const formIds = ['cook-shrimp-form', 'cook-gudgeon-form', 'cook-trout-form', 'cook-wolf-meat-form', 'cook-bass-form', 'cook-salmon-form']; // Include self
    showForm('cook-gudgeon-form', formIds, 'cook-gudgeon-character', 'Cook Gudgeon');
}

// Start the cook gudgeon process
function startCookGudgeon() {
    safelyStartScript(
        'cook-gudgeon-form',
        'cook-gudgeon-character',
        'cook-gudgeon-loop.js',
        'gudgeon cooking'
    );
}

// Show the strange ore mining form
function showStrangeOreMiningForm() {
    const formIds = [
        'copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form',
        'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form',
        'iron-bar-crafting-form', 'mithril-mining-form'
    ];
    showForm('strange-ore-mining-form', formIds, 'strange-ore-mining-character', 'Strange Ore Mining');
}

// Start the strange ore mining process
function startStrangeOreMining() {
    safelyStartScript(
        'strange-ore-mining-form',
        'strange-ore-mining-character',
        'strange-ore-mining-loop.js',
        'strange ore mining',
        () => {
            // Provides coordinates as extra argument
            const coordsInput = document.getElementById('strange-ore-mining-coords').value;
            const coordsMatch = coordsInput.match(/\s*(-?\d+)\s*,\s*(-?\d+)\s*/);
            if (!coordsMatch) {
                if (window.CharactersModule && CharactersModule.showNotification) {
                    window.CharactersModule.showNotification('Please enter valid coordinates in format "X,Y"', true);
                }
                return null; // Indicate failure
            }
            const oreX = parseInt(coordsMatch[1]);
            const oreY = parseInt(coordsMatch[2]);
            const coordsArg = `(${oreX},${oreY})`;
            // The script expects character first, then coordinates
            return [coordsArg]; // Return coordinates string as the extra argument
        }
    );
}

// Show the copper bar crafting form
function showCopperBarCraftingForm() {
    const formIds = [
        'copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form',
        'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form',
        'iron-bar-crafting-form', 'mithril-mining-form'
    ];
    showForm('copper-bar-crafting-form', formIds, 'copper-bar-crafting-character', 'Copper Bar Crafting');
}

// Start the copper bar crafting process
function startCopperBarCrafting() {
    safelyStartScript(
        'copper-bar-crafting-form',
        'copper-bar-crafting-character',
        'copper-bar-crafting-loop.js',
        'copper bar crafting'
    );
}

// Show the iron bar crafting form
function showIronBarCraftingForm() {
    const formIds = [
        'copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form',
        'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form',
        'iron-bar-crafting-form', 'mithril-mining-form'
    ];
    showForm('iron-bar-crafting-form', formIds, 'iron-bar-crafting-character', 'Iron Bar Crafting');
}

// Start the iron bar crafting process
function startIronBarCrafting() {
    safelyStartScript(
        'iron-bar-crafting-form',
        'iron-bar-crafting-character',
        'iron-bar-crafting-loop.js',
        'iron bar crafting'
    );
}


// Show the copper ring crafting form
function showCopperRingCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Added adventurer boots form
    showForm('copper-ring-crafting-form', formIds, 'copper-ring-character', 'Copper Ring Crafting');
}

// Start the copper ring crafting process
function startCopperRingCrafting() {
    const character = document.getElementById('copper-ring-character').value;
    
    console.log(`Starting copper ring crafting with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for Copper Ring crafting', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('copper-ring-crafting-loop.js', args);
    document.getElementById('copper-ring-crafting-form').style.display = 'none';
}

// Show the iron ring crafting form
function showIronRingCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Added adventurer boots form
    showForm('iron-ring-crafting-form', formIds, 'iron-ring-character', 'Iron Ring Crafting');
}

// Start the iron ring crafting process
function startIronRingCrafting() {
    const character = document.getElementById('iron-ring-character').value;
    
    console.log(`Starting iron ring crafting with character: ${character}`);
    
    // Make sure we have a valid character name
    if (!character) {
        window.CharactersModule.showNotification('Please select a character for Iron Ring crafting', true);
        return;
    }
    
    // Always pass the character name explicitly
    const args = [character];
    
    window.ProcessesModule.startScript('iron-ring-crafting-loop.js', args);
    document.getElementById('iron-ring-crafting-form').style.display = 'none';
}

// Show the mithril mining form
function showMithrilMiningForm() {
    // Define all relevant form IDs for mining/smelting
    const formIds = [
        'copper-mining-form', 'iron-mining-form', 'coal-mining-form', 'gold-mining-form',
        'steel-crafting-form', 'strange-ore-mining-form', 'copper-bar-crafting-form',
        'iron-bar-crafting-form', 'mithril-mining-form' // Include the mithril form itself
    ];
    // Use the generic helper to show the form
    showForm('mithril-mining-form', formIds, 'mithril-mining-character', 'Mithril Mining');
}

// Start the mithril mining process
function startMithrilMining() {
    // Use the generic helper to start the script
    safelyStartScript(
        'mithril-mining-form',
        'mithril-mining-character',
        'mithril-mining-loop.js',
        'mithril mining',
        () => {
            // This function provides the extra arguments based on the processing option
            const processOption = document.getElementById('mithril-mining-process').value;
            const args = [];

            if (processOption === 'refine') {
                args.push('--refine');
            }
            // The --target argument is no longer needed as the input was removed.
            // The script will use its default behavior (mine until inventory full).
            
            return args; // Return the array of extra arguments (potentially empty or just ['--refine'])
        }
    );
}

// Show the adventurer boots crafting form
function showAdventurerBootsCraftingForm() {
    // Use the generic form handling helper
    const formIds = ['leather-boots-crafting-form', 'iron-sword-crafting-form', 'iron-dagger-crafting-form', 'copper-ring-crafting-form', 'iron-ring-crafting-form', 'adventurer-boots-crafting-form']; // Include self
    showForm('adventurer-boots-crafting-form', formIds, 'adventurer-boots-character', 'Adventurer Boots Crafting');
}

// Start the adventurer boots crafting process
function startAdventurerBootsCrafting() {
    safelyStartScript(
        'adventurer-boots-crafting-form',
        'adventurer-boots-character',
        'adventurer-boots-crafting-loop.js',
        'adventurer boots crafting',
        () => {
            // This function provides the extra arguments based on the checkbox
            const noRecycleCheckbox = document.getElementById('adventurer-boots-no-recycle');
            const args = [];
            if (noRecycleCheckbox && noRecycleCheckbox.checked) {
                args.push('--no-recycle');
            }
            return args; // Return array with flag if checked, empty otherwise
        }
    );
}


// Export functions to global scope for inline event handlers
window.showLeatherBootsCraftingForm = showLeatherBootsCraftingForm;
window.startLeatherBootsCrafting = startLeatherBootsCrafting;
window.showIronSwordCraftingForm = showIronSwordCraftingForm;
window.startIronSwordCrafting = startIronSwordCrafting;
window.showIronDaggerCraftingForm = showIronDaggerCraftingForm;
window.startIronDaggerCrafting = startIronDaggerCrafting;
window.showCopperRingCraftingForm = showCopperRingCraftingForm;
window.startCopperRingCrafting = startCopperRingCrafting;
window.showIronRingCraftingForm = showIronRingCraftingForm;
window.startIronRingCrafting = startIronRingCrafting;
window.startCombat = startCombat;
window.startMining = startMining;
window.showCopperMiningForm = showCopperMiningForm;
window.startCopperMining = startCopperMining;
window.showIronMiningForm = showIronMiningForm;
window.startIronMining = startIronMining;
window.showCoalMiningForm = showCoalMiningForm;
window.startCoalMining = startCoalMining;
window.showGoldMiningForm = showGoldMiningForm;
window.startGoldMining = startGoldMining;
window.showSteelCraftingForm = showSteelCraftingForm;
window.startSteelCrafting = startSteelCrafting;
window.showStrangeOreMiningForm = showStrangeOreMiningForm; // Added strange ore
window.startStrangeOreMining = startStrangeOreMining; // Added strange ore
window.showCopperBarCraftingForm = showCopperBarCraftingForm; // Added copper bar
window.startCopperBarCrafting = startCopperBarCrafting; // Added copper bar
window.showIronBarCraftingForm = showIronBarCraftingForm; // Added iron bar
window.startIronBarCrafting = startIronBarCrafting; // Added iron bar
window.showAshHarvestingForm = showAshHarvestingForm;
window.startAshHarvesting = startAshHarvesting;
window.showBirchHarvestingForm = showBirchHarvestingForm;
window.startBirchHarvesting = startBirchHarvesting;
window.showSpruceHarvestingForm = showSpruceHarvestingForm;
window.startSpruceHarvesting = startSpruceHarvesting;
window.showMapleHarvestingForm = showMapleHarvestingForm;
window.startMapleHarvesting = startMapleHarvesting;
window.showDeadwoodHarvestingForm = showDeadwoodHarvestingForm;
window.startDeadwoodHarvesting = startDeadwoodHarvesting;
window.showHardwoodPlankCraftingForm = showHardwoodPlankCraftingForm;
window.startHardwoodPlankCrafting = startHardwoodPlankCrafting;
window.showStrangeWoodHarvestingForm = showStrangeWoodHarvestingForm; // Added strange wood
window.startStrangeWoodHarvesting = startStrangeWoodHarvesting; // Added strange wood
window.showShrimpHarvestingForm = showShrimpHarvestingForm;
window.startShrimpHarvesting = startShrimpHarvesting;
window.showGudgeonHarvestingForm = showGudgeonHarvestingForm;
window.startGudgeonHarvesting = startGudgeonHarvesting;
window.showTroutHarvestingForm = showTroutHarvestingForm;
window.startTroutHarvesting = startTroutHarvesting;
window.showBassHarvestingForm = showBassHarvestingForm;
window.startBassHarvesting = startBassHarvesting;
window.showSalmonHarvestingForm = showSalmonHarvestingForm; // Added salmon
window.startSalmonHarvesting = startSalmonHarvesting; // Added salmon
window.showMinorHealthPotionForm = showMinorHealthPotionForm;
window.startMinorHealthPotionCrafting = startMinorHealthPotionCrafting;
window.showHealthPotionForm = showHealthPotionForm;
window.startHealthPotionCrafting = startHealthPotionCrafting;
window.showAirBoostPotionForm = showAirBoostPotionForm;
window.startAirBoostPotionCrafting = startAirBoostPotionCrafting;
window.showNettleHarvestingForm = showNettleHarvestingForm;
window.startNettleHarvesting = startNettleHarvesting;
window.showSunflowerHarvestingForm = showSunflowerHarvestingForm;
window.startSunflowerHarvesting = startSunflowerHarvesting;
window.showGlowstemHarvestingForm = showGlowstemHarvestingForm;
window.startGlowstemHarvesting = startGlowstemHarvesting;
window.showCookShrimpForm = showCookShrimpForm; // Added shrimp
window.startCookShrimp = startCookShrimp; // Added shrimp
window.showCookGudgeonForm = showCookGudgeonForm; // Added gudgeon
window.startCookGudgeon = startCookGudgeon; // Added gudgeon
window.showCookTroutForm = showCookTroutForm;
window.startCookTrout = startCookTrout;
window.showCookWolfMeatForm = showCookWolfMeatForm;
window.startCookWolfMeat = startCookWolfMeat;
window.showCookBassForm = showCookBassForm;
window.startCookBass = startCookBass;
window.showCookSalmonForm = showCookSalmonForm; // Added salmon
window.startCookSalmon = startCookSalmon; // Added salmon
window.showMithrilMiningForm = showMithrilMiningForm; // Export new function
window.startMithrilMining = startMithrilMining; // Export new function
window.showAdventurerBootsCraftingForm = showAdventurerBootsCraftingForm; // Export new function
window.startAdventurerBootsCrafting = startAdventurerBootsCrafting; // Export new function

// Export the module
window.TasksModule = {
    init: initTasks,
    updateCharacterDropdown: updateCharacterDropdown,
    // Gear crafting
    showLeatherBootsCraftingForm: showLeatherBootsCraftingForm,
    startLeatherBootsCrafting: startLeatherBootsCrafting,
    showIronSwordCraftingForm: showIronSwordCraftingForm,
    startIronSwordCrafting: startIronSwordCrafting,
    showIronDaggerCraftingForm: showIronDaggerCraftingForm,
    startIronDaggerCrafting: startIronDaggerCrafting,
    showCopperRingCraftingForm: showCopperRingCraftingForm,
    startCopperRingCrafting: startCopperRingCrafting,
    showIronRingCraftingForm: showIronRingCraftingForm,
    startIronRingCrafting: startIronRingCrafting,
    showAdventurerBootsCraftingForm: showAdventurerBootsCraftingForm, // Added
    startAdventurerBootsCrafting: startAdventurerBootsCrafting, // Added
    // Mining
    startMining: startMining,
    showCopperMiningForm: showCopperMiningForm,
    startCopperMining: startCopperMining,
    showIronMiningForm: showIronMiningForm,
    startIronMining: startIronMining,
    showCoalMiningForm: showCoalMiningForm,
    startCoalMining: startCoalMining,
    showGoldMiningForm: showGoldMiningForm,
    startGoldMining: startGoldMining,
    showSteelCraftingForm: showSteelCraftingForm,
    startSteelCrafting: startSteelCrafting,
    showStrangeOreMiningForm: showStrangeOreMiningForm, // Added strange ore
    startStrangeOreMining: startStrangeOreMining, // Added strange ore
    showCopperBarCraftingForm: showCopperBarCraftingForm, // Added copper bar
    startCopperBarCrafting: startCopperBarCrafting, // Added copper bar
    showIronBarCraftingForm: showIronBarCraftingForm, // Added iron bar
    startIronBarCrafting: startIronBarCrafting, // Added iron bar
    // Woodcutting
    showAshHarvestingForm: showAshHarvestingForm,
    startAshHarvesting: startAshHarvesting,
    showBirchHarvestingForm: showBirchHarvestingForm,
    startBirchHarvesting: startBirchHarvesting,
    showSpruceHarvestingForm: showSpruceHarvestingForm,
    startSpruceHarvesting: startSpruceHarvesting,
    showMapleHarvestingForm: showMapleHarvestingForm,
    startMapleHarvesting: startMapleHarvesting,
    showDeadwoodHarvestingForm: showDeadwoodHarvestingForm,
    startDeadwoodHarvesting: startDeadwoodHarvesting,
    showHardwoodPlankCraftingForm: showHardwoodPlankCraftingForm,
    startHardwoodPlankCrafting: startHardwoodPlankCrafting,
    showStrangeWoodHarvestingForm: showStrangeWoodHarvestingForm, // Added strange wood
    startStrangeWoodHarvesting: startStrangeWoodHarvesting, // Added strange wood
    // Fishing
    showShrimpHarvestingForm: showShrimpHarvestingForm,
    startShrimpHarvesting: startShrimpHarvesting,
    showGudgeonHarvestingForm: showGudgeonHarvestingForm,
    startGudgeonHarvesting: startGudgeonHarvesting,
    showTroutHarvestingForm: showTroutHarvestingForm,
    startTroutHarvesting: startTroutHarvesting,
    showBassHarvestingForm: showBassHarvestingForm,
    startBassHarvesting: startBassHarvesting,
    showSalmonHarvestingForm: showSalmonHarvestingForm, // Added salmon
    startSalmonHarvesting: startSalmonHarvesting, // Added salmon
    // Alchemy
    showMinorHealthPotionForm: showMinorHealthPotionForm,
    startMinorHealthPotionCrafting: startMinorHealthPotionCrafting,
    showHealthPotionForm: showHealthPotionForm,
    startHealthPotionCrafting: startHealthPotionCrafting,
    showAirBoostPotionForm: showAirBoostPotionForm,
    startAirBoostPotionCrafting: startAirBoostPotionCrafting,
    showNettleHarvestingForm: showNettleHarvestingForm,
    startNettleHarvesting: startNettleHarvesting,
    showSunflowerHarvestingForm: showSunflowerHarvestingForm,
    startSunflowerHarvesting: startSunflowerHarvesting,
    showGlowstemHarvestingForm: showGlowstemHarvestingForm,
    startGlowstemHarvesting: startGlowstemHarvesting,
    // Cooking
    showCookShrimpForm: showCookShrimpForm, // Added shrimp
    startCookShrimp: startCookShrimp, // Added shrimp
    showCookGudgeonForm: showCookGudgeonForm, // Added gudgeon
    startCookGudgeon: startCookGudgeon, // Added gudgeon
    showCookTroutForm: showCookTroutForm,
    startCookTrout: startCookTrout,
    showCookWolfMeatForm: showCookWolfMeatForm,
    startCookWolfMeat: startCookWolfMeat,
    showCookBassForm: showCookBassForm,
    startCookBass: startCookBass,
    showCookSalmonForm: showCookSalmonForm, // Added salmon
    startCookSalmon: startCookSalmon, // Added salmon
    // Mithril Mining (Added)
    showMithrilMiningForm: showMithrilMiningForm,
    startMithrilMining: startMithrilMining,
    // Combat
    startCombat: startCombat
};
