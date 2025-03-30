/**
 * Character management for the ArtifactsMMO Client
 * Handles fetching character data and populating dropdowns
 */

// Global characters list
window.charactersList = [];

// Fetch character names from the API
async function fetchCharacterNames() {
    try {
        console.log('[DEBUG-CLIENT] Starting character fetch...');
        
        // Check if we're using mock data for testing
        if (window.USE_MOCK_DATA === 'true') {
            console.log('[DEBUG-CLIENT] Using mock character data');
            window.charactersList = ['MockCharacter1', 'MockCharacter2', 'MockCharacter3'];
            createCharacterDropdowns();
            return;
        }
        
        // Fetch the list of characters from the API
        const response = await fetch('/api/characters');
        console.log('[DEBUG-CLIENT] Characters API response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch characters: ${response.statusText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        console.log('[DEBUG-CLIENT] Characters API response type:', typeof data);
        
        // Process the data depending on its format
        if (Array.isArray(data)) {
            console.log('[DEBUG-CLIENT] Response is an array of length:', data.length);
            
            // Extract character names from the array
            window.charactersList = data.map(char => {
                if (!char) {
                    console.log('[DEBUG-CLIENT] Found null/undefined item in response array');
                    return '';
                }
                
                if (typeof char === 'object' && char.name) {
                    return char.name;
                } else if (typeof char === 'string') {
                    return char;
                } else {
                    console.log(`[DEBUG-CLIENT] Unexpected item format: ${JSON.stringify(char)}`);
                    return '';
                }
            }).filter(name => name); // Filter out empty names
            
            console.log(`[DEBUG-CLIENT] Characters extracted: ${window.charactersList.join(', ')}`);
            
            // Create dropdowns with the character list
            if (window.charactersList.length > 0) {
                createCharacterDropdowns();
                showNotification(`Loaded ${window.charactersList.length} characters successfully!`);
            } else {
                console.log('[DEBUG-CLIENT] Character list is empty after processing');
                showNotification('No valid characters found. Using text inputs instead.', true);
            }
        } else {
            console.log(`[DEBUG-CLIENT] Unexpected data format: ${typeof data}`);
            showNotification('Failed to load characters. Check console for details.', true);
        }
    } catch (error) {
        console.error('[DEBUG-CLIENT] Error fetching characters:', error);
        showNotification(`Error: ${error.message}`, true);
    }
}

// Create character dropdowns based on the charactersList
function createCharacterDropdowns() {
    const selectElements = document.querySelectorAll('select[data-character-dropdown]');
    
    selectElements.forEach(select => {
        // Skip if the select is null or not a select element
        if (!select || select.tagName !== 'SELECT') return;
        
        // Store the current value if there is one
        const currentValue = select.value;
        
        // Clear existing options
        select.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select a character';
        select.appendChild(defaultOption);
        
        // Add options for each character
        window.charactersList.forEach(name => {
            if (!name) return;
            
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        
        // Restore selected value if it exists in the new options
        if (currentValue) {
            const exists = Array.from(select.options).some(option => option.value === currentValue);
            if (exists) {
                select.value = currentValue;
            }
        }
    });
}

// Show a notification message to the user
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = 'notification ' + (isError ? 'error' : 'success');
    notification.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Initialize character functionality
function initCharacters() {
    // Fetch character names on page load
    fetchCharacterNames();
}

// Export the module functions
window.CharactersModule = {
    init: initCharacters,
    fetchCharacters: fetchCharacterNames,
    createDropdowns: createCharacterDropdowns,
    showNotification: showNotification
};