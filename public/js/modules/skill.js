/**
 * Individual skill module for ArtifactsMMO Client
 * Provides utility functions for skill-related operations
 */

/**
 * Calculate XP needed to reach a specific level
 * @param {number} level - Target level
 * @returns {number} - XP required to reach the level
 */
function calculateXpForLevel(level) {
    if (level <= 1) return 0;
    
    if (level <= 10) {
        // Levels 1-10: 150 × (level - 1)
        return 150 * (level - 1);
    } else if (level <= 20) {
        // Levels 11-20: 1350 + 250 × (level - 10)
        return 1350 + 250 * (level - 10);
    } else if (level <= 30) {
        // Levels 21-30: 3850 + 450 × (level - 20)
        return 3850 + 450 * (level - 20);
    } else {
        // Levels 31+: 8350 + 700 × (level - 30)
        return 8350 + 700 * (level - 30);
    }
}

/**
 * Calculate the percentage of progress to the next level
 * @param {number} currentXp - Current XP
 * @param {number} targetXp - XP needed for next level
 * @returns {number} - Percentage (0-100)
 */
function calculateLevelProgress(currentXp, targetXp) {
    if (targetXp <= 0) return 100;
    
    const previousLevelXp = calculateXpForLevel(calculateLevelFromXp(currentXp));
    const xpInCurrentLevel = currentXp - previousLevelXp;
    const xpNeededForNextLevel = targetXp - previousLevelXp;
    
    return Math.min(100, Math.floor((xpInCurrentLevel / xpNeededForNextLevel) * 100));
}

/**
 * Calculate the level based on XP amount
 * @param {number} xp - Current XP
 * @returns {number} - Current level
 */
function calculateLevelFromXp(xp) {
    if (xp < 150) return 1;
    
    if (xp < 3850) {
        // Levels 2-20
        if (xp < 1350) {
            // Levels 2-10: XP / 150 + 1
            return Math.floor(xp / 150) + 1;
        } else {
            // Levels 11-20: (XP - 1350) / 250 + 11
            return Math.floor((xp - 1350) / 250) + 11;
        }
    } else if (xp < 8350) {
        // Levels 21-30: (XP - 3850) / 450 + 21
        return Math.floor((xp - 3850) / 450) + 21;
    } else {
        // Levels 31+: (XP - 8350) / 700 + 31
        return Math.floor((xp - 8350) / 700) + 31;
    }
}

// Export the module functions
window.SkillUtils = {
    calculateXpForLevel,
    calculateLevelProgress,
    calculateLevelFromXp
};