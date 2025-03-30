# ArtifactsMMO Client - GUI Test Plan

This test plan outlines the steps needed to verify that the refactored GUI is working correctly.

## Prerequisites

1. Node.js and npm installed
2. ArtifactsMMO Client repository cloned
3. Dependencies installed (`npm install`)
4. Environment variables set up (.env file)

## Starting the Application

1. Start the server with `node gui.js`
2. Open a browser and navigate to `http://localhost:3000`

## Test Cases

### 1. Tab Navigation

- [ ] Click on each tab and verify it becomes active
- [ ] Verify that only one tab's content is displayed at a time
- [ ] Check that the active tab is highlighted

### 2. Character Dropdown Population

- [ ] Verify that all character dropdowns are automatically populated
- [ ] Confirm that character names appear in all dropdowns with the data-character-dropdown attribute

### 3. Process Management

- [ ] Start a process (e.g., copper mining)
- [ ] Verify it appears in the process list
- [ ] Check that the process details are displayed correctly
- [ ] View process output and verify it updates
- [ ] Stop the process and verify its status changes
- [ ] Clear stopped processes and confirm they're removed

### 4. Skills Tab

- [ ] Navigate to the Skills tab
- [ ] Verify that character skills are displayed
- [ ] Check that skill levels are color-coded correctly
- [ ] Confirm that all skill columns are present

### 5. Task Functionality

#### Mining

- [ ] Start copper mining and verify the process starts
- [ ] Start iron mining and verify the process starts
- [ ] Check that character selection works in the mining form

#### Gear Crafting

- [ ] Navigate to the Gear tab
- [ ] Test leather boots crafting
- [ ] Test iron sword crafting
- [ ] Test iron dagger crafting with different quantities
- [ ] Verify that character selection works in all crafting forms

#### Combat

- [ ] Test combat functionality with coordinates
- [ ] Verify fight with auto-heal works
- [ ] Check that character selection works in the combat form

#### Utilities

- [ ] Test deposit all functionality
- [ ] Verify character selection works

### 6. Error Handling

- [ ] Intentionally cause an error (e.g., invalid input) and verify error message appears
- [ ] Check that error notifications display correctly

## Responsive Design

- [ ] Test the interface at different screen sizes
- [ ] Verify that the layout adjusts appropriately

## Browser Compatibility

- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari (if available)

## Final Validation

- [ ] Verify that all functions from the original monolithic UI work in the refactored version
- [ ] Confirm that there are no JavaScript errors in the console
- [ ] Check that all resources load properly (scripts, stylesheets)

## Notes

Document any issues encountered during testing here.