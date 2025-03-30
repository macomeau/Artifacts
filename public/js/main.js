/**
 * Main JavaScript file for the ArtifactsMMO Client
 * Initializes and coordinates all modules
 */

// Initialize the application once DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set debug flag for development
    window.DEBUG = true;
    
    // Initialize all modules
    if (window.TabsModule) TabsModule.init();
    if (window.CharactersModule) CharactersModule.init();
    if (window.ProcessesModule) ProcessesModule.init();
    if (window.SkillsModule) SkillsModule.init();
    if (window.TasksModule) TasksModule.init();
    
    // Log initialization completion
    if (window.DEBUG) {
        console.log('ArtifactsMMO Client initialized');
        console.log("Tab buttons found:", document.getElementsByClassName("tab-button").length);
        console.log("Tab contents found:", document.getElementsByClassName("tab-content").length);
    }
});

// Debugging function
function debugLog(message) {
    if (window.DEBUG) {
        console.log(message);
    }
}

// Global error handler
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', message, 'at', source, ':', lineno, ':', colno);
    if (window.CharactersModule && CharactersModule.showNotification) {
        CharactersModule.showNotification(`Error: ${message}`, true);
    }
    return false; // Let default error handler run
};

// Mining/Crafting functions moved to tasks.js module
// - showStrangeOreMiningForm
// - startStrangeOreMining
// - showCopperBarCraftingForm
// - startCopperBarCrafting
// - showIronBarCraftingForm
// - startIronBarCrafting
// - showCopperRingCraftingForm (already moved)
// - startCopperRingCrafting (already moved)
