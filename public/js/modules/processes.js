/**
 * Process management for the ArtifactsMMO Client
 * Handles starting, stopping, and monitoring processes
 */

// Global variables for process management
let processRefreshInterval = null;
let currentProcessFilter = localStorage.getItem('processFilter') || 'running';

// Start a script with given arguments
async function startScript(script, args = []) {
    try {
        if (!script) {
            console.error('Script name is required');
            return;
        }
        
        // Make the API request to start the script
        const response = await fetch('/api/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ script, args })
        });
        
        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        
        // Refresh the process list after starting a script
        loadProcesses();

        // Show success notification
        window.CharactersModule.showNotification(`Successfully started ${script} job`, false);
        
        // Return the process ID
        return data.id;
    } catch (error) {
        console.error('Failed to start script:', error.message);
        window.CharactersModule.showNotification(`Failed to start ${script}: ${error.message}`, true);
    }
}

// Stop a running process
async function stopProcess(id) {
    try {
        // Make the API request to stop the process
        const response = await fetch('/api/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id })
        });
        
        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        
        // Refresh the process list after stopping a process
        loadProcesses();
        
        // Return the success status
        return data.success;
    } catch (error) {
        console.error('Failed to stop process:', error.message);
        window.CharactersModule.showNotification(`Failed to stop process: ${error.message}`, true);
    }
}

// Load the list of processes
async function loadProcesses() {
    try {
        // Make the API request to get the process list
        const response = await fetch('/api/processes');
        
        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        
        // Update the UI with the process list
        updateProcessList(data.processes || []);
    } catch (error) {
        console.error('Failed to load processes:', error.message);
    }
}

// Format a duration from milliseconds to a human-readable string
function formatDuration(ms) {
    if (!ms || ms <= 0) return 'N/A';
    
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

// Update the process list in the UI
function updateProcessList(processes) {
    const container = document.getElementById('process-list');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Filter processes based on the current filter
    const filteredProcesses = filterProcessesByType(processes);
    
    // Make sure we have loopCount and activityCount properties on each process
    filteredProcesses.forEach(process => {
        if (!process.hasOwnProperty('loopCount')) process.loopCount = 0;
        if (!process.hasOwnProperty('activityCount')) process.activityCount = 0;
    });
    
    // Get current time for duration calculations
    const now = new Date();
    
    // Create a card for each process
    filteredProcesses.forEach(process => {
        // Create the process card
        const card = document.createElement('div');
        card.className = 'process-row ' + (process.running ? 'running' : 'stopped');
        
        // Add process information
        const scriptName = document.createElement('div');
        scriptName.className = 'process-script';
        
        // Format the script name for better readability
        let scriptBaseName = process.script.replace(/\.js$/, '')  // Remove .js extension
                                        .replace(/-loop/g, '')    // Remove "loop" word
                                        .replace(/^go-/, '')      // Remove "go-" prefix
                                        .replace(/-/g, ' ');      // Replace hyphens with spaces
        
        // Capitalize all words
        scriptBaseName = scriptBaseName.split(' ')
                                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                      .join(' ');
        
        scriptName.textContent = scriptBaseName;
        card.appendChild(scriptName);
        
        const characterName = document.createElement('div');
        characterName.className = 'process-character';
        
        // Special case for scripts that have coordinates as first arg and character as second arg
        if ((process.script.includes('go-fight') || 
             process.script.includes('go-gather') || 
             process.script.includes('fight-loop') || 
             process.script.includes('gathering-loop') ||
             process.script.includes('strange-ore-mining-loop')) && 
            process.args?.length > 1 && 
            /^\s*\(?\s*-?\d+\s*,\s*-?\d+\s*\)?\s*$/.test(process.args[0])) {
            // The first argument looks like coordinates, use the second argument as character name
            characterName.textContent = process.args[1] || 'N/A';
            
            // Add the coordinates as a tooltip
            characterName.title = `Location: ${process.args[0]}`;
            
            // Add small coordinates indicator
            const coordIndicator = document.createElement('span');
            coordIndicator.className = 'coord-indicator';
            coordIndicator.textContent = ` 📍`; // Map pin emoji
            characterName.appendChild(coordIndicator);
        } else {
            characterName.textContent = process.args?.[0] || 'N/A';
        }
        
        card.appendChild(characterName);
        
        const statusEl = document.createElement('div');
        statusEl.className = 'process-status';
        statusEl.textContent = process.running ? 'Running' : (process.exitCode === 0 ? 'Completed' : 'Failed');
        card.appendChild(statusEl);
        
        // Empty div for spacing where the loop count used to be
        const spacerEl = document.createElement('div');
        spacerEl.className = 'process-progress';
        card.appendChild(spacerEl);
        
        // Calculate and display process duration
        const durationEl = document.createElement('div');
        durationEl.className = 'process-duration';
        
        // Calculate duration
        const startTime = process.startTime ? new Date(process.startTime) : null;
        const endTime = process.endTime ? new Date(process.endTime) : null;
        
        if (startTime) {
            const elapsed = process.running ? 
                now - startTime : 
                (endTime ? endTime - startTime : 0);
            
            durationEl.textContent = formatDuration(elapsed);
            
            // Add a data attribute for live updating if the process is running
            if (process.running) {
                durationEl.dataset.startTime = startTime.getTime();
                durationEl.classList.add('live-duration');
            }
        } else {
            durationEl.textContent = 'N/A';
        }
        
        card.appendChild(durationEl);
        
        // Add actions
        const actionsEl = document.createElement('div');
        actionsEl.className = 'process-actions';
        
        // Add view output button
        const viewBtn = document.createElement('button');
        viewBtn.className = 'action-button view';
        viewBtn.textContent = 'View';
        viewBtn.onclick = () => viewProcessOutput(process.id);
        actionsEl.appendChild(viewBtn);
        
        // Add stop button for running processes
        if (process.running) {
            const stopBtn = document.createElement('button');
            stopBtn.className = 'action-button stop';
            stopBtn.textContent = 'Stop';
            stopBtn.onclick = () => stopProcess(process.id);
            actionsEl.appendChild(stopBtn);
        }
        
        card.appendChild(actionsEl);
        
        // Add the card to the container
        container.appendChild(card);
    });
    
    // Show a message if no processes are visible
    if (filteredProcesses.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = 'No processes found.';
        container.appendChild(emptyMessage);
    }
    
    // Update live durations for running processes
    updateLiveDurations();
}

// Filter processes based on the current filter
function filterProcessesByType(processes) {
    // Get the current filter value
    const filterValue = currentProcessFilter;
    
    // Store the filter value in localStorage
    localStorage.setItem('processFilter', filterValue);
    
    // Apply the filter
    return processes.filter(process => {
        if (filterValue === 'all') {
            return true;
        } else if (filterValue === 'running') {
            return process.running;
        } else if (filterValue === 'stopped') {
            return !process.running;
        } else {
            // Filter by script name if no general filter matches
            return process.script.includes(filterValue);
        }
    });
}

// Filter processes based on user selection
function filterProcesses() {
    const filterDropdown = document.getElementById('process-filter');
    const filterValue = filterDropdown ? filterDropdown.value : 'running';
    currentProcessFilter = filterValue;
    
    // Reload processes with the new filter
    loadProcesses();
}

// View process output
async function viewProcessOutput(id) {
    try {
        // Find the process details from the list
        const response = await fetch('/api/processes');
        if (!response.ok) {
            throw new Error(`API error (${response.status}): ${await response.text()}`);
        }
        
        const data = await response.json();
        const process = data.processes.find(p => p.id === id);
        
        if (!process) {
            throw new Error(`Process ${id} not found`);
        }
        
        // Show the modal first
        const outputModal = document.getElementById('process-output-modal');
        const outputContent = document.getElementById('process-output-content');
        const processIdEl = document.getElementById('process-id');
        const processScriptName = document.getElementById('process-script-name');
        const processScriptPath = document.getElementById('process-script-path');
        const processCharacter = document.getElementById('process-character');
        const processArguments = document.getElementById('process-arguments');
        const processDuration = document.getElementById('process-duration');
        
        if (outputModal && outputContent && processIdEl) {
            // Set the process ID and details
            processIdEl.textContent = id;
            
            // Format script name for better display
            let scriptBaseName = process.script.replace(/\.js$/, '')  // Remove .js extension
                                        .replace(/-loop/g, '')        // Remove "loop" word
                                        .replace(/^go-/, '')          // Remove "go-" prefix
                                        .replace(/-/g, ' ');          // Replace hyphens with spaces
            
            // Capitalize all words
            scriptBaseName = scriptBaseName.split(' ')
                                         .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                         .join(' ');
            
            processScriptName.textContent = scriptBaseName;
            processScriptPath.textContent = process.script;

            // --- Add Copy Button ---
            const modalHeader = processScriptName.closest('.modal-header'); // Find the header containing the script name
            if (modalHeader) {
                // Remove existing button if present (to avoid duplicates on reopen)
                const existingButton = modalHeader.querySelector('.copy-log-button');
                if (existingButton) {
                    existingButton.remove();
                }

                const copyButton = document.createElement('button');
                copyButton.textContent = 'Copy Logs';
                copyButton.className = 'copy-log-button action-button'; // Use existing button style
                copyButton.style.marginLeft = 'auto'; // Push it towards the right, adjust as needed
                copyButton.style.marginRight = '10px'; // Space before close button
                copyButton.onclick = () => copyLogsToClipboard(outputContent, copyButton); // Attach click handler
                 
                // Insert the button before the close button within the header
                const closeButton = modalHeader.querySelector('#close-output-modal');
                if (closeButton) {
                   modalHeader.insertBefore(copyButton, closeButton);
                } else {
                   modalHeader.appendChild(copyButton); // Fallback append
                }
            }
            // --- End Add Copy Button ---
             
            // Handle character and args
            if (process.args && process.args.length > 0) {
                // Special case for scripts that have coordinates as first arg and character as second arg
                if ((process.script.includes('go-fight') || 
                     process.script.includes('go-gather') || 
                     process.script.includes('fight-loop') || 
                     process.script.includes('gathering-loop')) && 
                    process.args.length > 1 && 
                    /^\s*\(?\s*-?\d+\s*,\s*-?\d+\s*\)?\s*$/.test(process.args[0])) {
                    // First arg is coordinates, second is character
                    processCharacter.textContent = process.args[1] || 'N/A';
                    processArguments.textContent = `Location: ${process.args[0]}`;
                } else {
                    // Standard case - first arg is character name
                    processCharacter.textContent = process.args[0] || 'N/A';
                    // Show remaining args if any
                    if (process.args.length > 1) {
                        processArguments.textContent = process.args.slice(1).join(', ');
                    } else {
                        processArguments.textContent = 'None';
                    }
                }
            } else {
                processCharacter.textContent = 'N/A';
                processArguments.textContent = 'None';
            }
            
            // Initialize output content
            outputContent.innerHTML = '<div class="loading-message">Loading process output...</div>';
            
            // Set up live duration if the process is running
            if (process.running) {
                const startTime = process.startTime ? new Date(process.startTime) : new Date();
                processDuration.dataset.startTime = startTime.getTime();
                processDuration.textContent = formatDuration(new Date() - startTime);
            } else if (process.startTime && process.endTime) {
                const startTime = new Date(process.startTime);
                const endTime = new Date(process.endTime);
                processDuration.textContent = formatDuration(endTime - startTime);
            } else {
                processDuration.textContent = 'N/A';
            }
            
            // Show the modal
            outputModal.style.display = 'flex';
            
            // Function to update output content
            const updateOutput = async () => {
                // Make the API request to get the process output
                const response = await fetch(`/api/output/${id}`);
                
                // Check if the response is OK
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API error (${response.status}): ${errorText}`);
                }
                
                // Parse the JSON response
                const data = await response.json();
                
                // Progress metrics have been removed
                // No need to update anything here
                
                // Format and display the output
                outputContent.innerHTML = '';
                
                data.output.forEach(line => {
                    const outputLine = document.createElement('div');
                    outputLine.className = `output-line ${line.type}`;
                    
                    // Format the timestamp
                    const time = new Date(line.time);
                    const timestamp = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;
                    
                    outputLine.textContent = `[${timestamp}] ${line.text}`;
                    outputContent.appendChild(outputLine);
                });
                
                // Scroll to the bottom of the output
                outputContent.scrollTop = outputContent.scrollHeight;
                
                // If the process is still running, schedule another update
                if (data.running) {
                    return true;
                }
                return false;
            };
            
            // Initial update
            const isRunning = await updateOutput();
            
            // Set up interval for live updates if the process is running
            let outputRefreshInterval = null;
            if (isRunning) {
                outputRefreshInterval = setInterval(async () => {
                    const stillRunning = await updateOutput();
                    if (!stillRunning && outputRefreshInterval) {
                        clearInterval(outputRefreshInterval);
                        outputRefreshInterval = null;
                    }
                }, 1000);
                
                // Store the interval ID on the modal element for cleanup
                outputModal.dataset.refreshInterval = outputRefreshInterval;
            }
            
            // Set up cleanup when modal is closed
            document.getElementById('close-output-modal').onclick = () => {
                if (outputRefreshInterval) {
                    clearInterval(outputRefreshInterval);
                }
                outputModal.style.display = 'none';
            };
        }
    } catch (error) {
        console.error('Failed to get process output:', error.message);
        window.CharactersModule.showNotification(`Failed to get process output: ${error.message}`, true);
    }
}

// Close the process output modal
function closeOutputModal() {
    const outputModal = document.getElementById('process-output-modal');
    if (outputModal) {
        // Clear any refresh interval stored on the modal
        const refreshInterval = outputModal.dataset.refreshInterval;
        if (refreshInterval) {
            clearInterval(parseInt(refreshInterval));
            delete outputModal.dataset.refreshInterval;
        }
        outputModal.style.display = 'none';
    }
}

// Clear all stopped processes
async function clearStoppedProcesses() {
    try {
        // Make the API request to clear stopped processes
        const response = await fetch('/api/clear-stopped', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Check if the response is OK
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error (${response.status}): ${errorText}`);
        }
        
        // Parse the JSON response
        const data = await response.json();
        
        // Refresh the process list
        loadProcesses();
        
        // Show a notification
        window.CharactersModule.showNotification(`Cleared ${data.count} stopped processes`);
    } catch (error) {
        console.error('Failed to clear stopped processes:', error.message);
        window.CharactersModule.showNotification(`Failed to clear stopped processes: ${error.message}`, true);
    }
}

// Initialize the process refresh interval
function initProcessRefresh() {
    // Load processes initially
    loadProcesses();
    
    // Clear any existing interval
    if (processRefreshInterval) {
        clearInterval(processRefreshInterval);
    }
    
    // Set up interval to refresh processes
    processRefreshInterval = setInterval(loadProcesses, 5000);
    
    // Set up filter dropdown
    const filterDropdown = document.getElementById('process-filter');
    if (filterDropdown) {
        filterDropdown.value = currentProcessFilter;
        filterDropdown.addEventListener('change', filterProcesses);
    }
    
    // Set up clear stopped button
    const clearStoppedBtn = document.getElementById('clear-stopped-btn');
    if (clearStoppedBtn) {
        clearStoppedBtn.addEventListener('click', clearStoppedProcesses);
    }
    
    // Set up modal close button
    const closeModalBtn = document.getElementById('close-output-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeOutputModal);
    }
}

// Update the live durations of running processes
function updateLiveDurations() {
    const now = new Date().getTime();
    const liveDurations = document.querySelectorAll('.live-duration');
    
    liveDurations.forEach(element => {
        const startTime = parseInt(element.dataset.startTime);
        if (startTime && !isNaN(startTime)) {
            const elapsed = now - startTime;
            element.textContent = formatDuration(elapsed);
        }
    });
}

// Update durations every second for running processes
let durationUpdateInterval = null;

// Initialize the dark mode theme
function initDarkMode() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    // Check if user preference exists in localStorage
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    
    // Apply the theme
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        themeToggle.querySelector('.theme-toggle-icon').textContent = '🌙';
        themeToggle.querySelector('.theme-toggle-text').textContent = 'Dark Mode';
    } else {
        document.body.classList.remove('dark-mode');
        themeToggle.querySelector('.theme-toggle-icon').textContent = '☀️';
        themeToggle.querySelector('.theme-toggle-text').textContent = 'Light Mode';
    }
    
    // Add click handler to toggle
    themeToggle.addEventListener('click', () => {
        const currentDarkMode = document.body.classList.contains('dark-mode');
        
        // Toggle the class
        document.body.classList.toggle('dark-mode');
        
        // Update the icon and text
        const icon = themeToggle.querySelector('.theme-toggle-icon');
        const text = themeToggle.querySelector('.theme-toggle-text');
        
        if (currentDarkMode) {
            icon.textContent = '☀️';
            text.textContent = 'Light Mode';
        } else {
            icon.textContent = '🌙';
            text.textContent = 'Dark Mode';
        }
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', !currentDarkMode);
    });
}

// Initialize process management
function initProcesses() {
    // Initialize theme
    initDarkMode();
    
    // Initialize process list
    initProcessRefresh();
    
    // Set up duration updates for running processes
    if (durationUpdateInterval) {
        clearInterval(durationUpdateInterval);
    }
    
    durationUpdateInterval = setInterval(updateLiveDurations, 1000);
}

// Export the module functions
window.ProcessesModule = {
    init: initProcesses,
    startScript: startScript,
    stopProcess: stopProcess,
    loadProcesses: loadProcesses,
    filterProcesses: filterProcesses,
    viewOutput: viewProcessOutput,
    clearStopped: clearStoppedProcesses
};
