/**
 * Tab functionality for the ArtifactsMMO Client
 * Manages tab switching and content display
 */

// Tab functionality
function openTab(evt, tabName) {
    // Handle both old and new tab activation methods
    let target, targetTabName;
    
    // If this is an event with currentTarget (from click event)
    if (evt && evt.currentTarget) {
        target = evt.currentTarget;
        
        // Get tab name from data-tab attribute or from the event
        targetTabName = target.getAttribute('data-tab') || tabName;
        
        // Only proceed if this isn't already the active tab
        if (target.classList.contains('active')) return;
    } 
    // If this is a direct call with element and tab name
    else if (typeof evt === 'string') {
        targetTabName = evt;
        target = document.querySelector(`.tab-button[data-tab="${targetTabName}"]`) || 
                document.querySelector(`.tab-button[onclick*="${targetTabName}"]`);
        
        if (!target) {
            console.error(`Cannot find tab button for tab: ${targetTabName}`);
            return;
        }
        
        if (target.classList.contains('active')) return;
    }
    // Handle legacy onclick="openTab(event, 'tabname')" format
    else {
        targetTabName = tabName; 
        target = evt ? evt.currentTarget : null;
        
        if (!target || !targetTabName) {
            console.error('Invalid tab activation');
            return;
        }
        
        if (target.classList.contains('active')) return;
    }
    
    // Add a slight delay for the animation
    setTimeout(() => {
        const tabContents = document.getElementsByClassName("tab-content");
        for (let i = 0; i < tabContents.length; i++) {
            tabContents[i].classList.remove("active");
        }
        
        const tabButtons = document.getElementsByClassName("tab-button");
        for (let i = 0; i < tabButtons.length; i++) {
            tabButtons[i].classList.remove("active");
        }
        
        // Activate the tab content
        const tabContent = document.getElementById(targetTabName);
        if (tabContent) {
            tabContent.classList.add("active");
        } else {
            console.error(`Tab content not found: ${targetTabName}`);
        }
        
        // Activate the tab button
        if (target) {
            target.classList.add("active");
        }
    }, 10);
}

// Initialize tab functionality
function initTabs() {
    // Set up click handlers for tab buttons
    const tabButtons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabButtons.length; i++) {
        const button = tabButtons[i];
        
        // Handle new style (data-tab) 
        const tabName = button.getAttribute('data-tab');
        
        // Skip if this button already has an onclick handler
        const hasOnclick = button.hasAttribute('onclick');
        
        if (tabName && !hasOnclick) {
            // Remove any existing listeners to avoid duplicates
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // Add the click listener
            newButton.addEventListener('click', function(event) {
                openTab(event, tabName);
            });
        }
    }
    
    // Activate the first tab by default if none is active
    if (!document.querySelector('.tab-button.active')) {
        const firstTab = document.querySelector('.tab-button');
        if (firstTab) {
            // Try to get tab name from data-tab attribute first
            let tabName = firstTab.getAttribute('data-tab');
            
            // If not found, try to extract it from onclick attribute
            if (!tabName && firstTab.hasAttribute('onclick')) {
                const onclickAttr = firstTab.getAttribute('onclick');
                const tabNameMatch = onclickAttr.match(/openTab\(\s*event,\s*'([^']+)'/);
                if (tabNameMatch && tabNameMatch[1]) {
                    tabName = tabNameMatch[1];
                }
            }
            
            if (tabName) {
                firstTab.classList.add('active');
                const tabContent = document.getElementById(tabName);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
            }
        }
    }
}

// Export the module functions
window.TabsModule = {
    init: initTabs,
    openTab: openTab
};