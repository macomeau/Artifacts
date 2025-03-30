/**
 * @fileoverview Script to initialize the character tasks database table
 * @module init-tasks-db
 */

const db = require('./db');

async function initializeTasksTable() {
  try {
    // Create the character_tasks table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS character_tasks (
        id SERIAL PRIMARY KEY,
        character VARCHAR(255) NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        script_name VARCHAR(255) NOT NULL,
        script_args JSONB DEFAULT '[]',
        state VARCHAR(50) NOT NULL DEFAULT 'idle',
        process_id VARCHAR(255),
        start_time TIMESTAMPTZ,
        last_updated TIMESTAMPTZ DEFAULT NOW(),
        task_data JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS character_tasks_character_idx
      ON character_tasks (character);
      
      CREATE INDEX IF NOT EXISTS character_tasks_state_idx
      ON character_tasks (state);
    `);
    
    console.log('✅ Character tasks table initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Character tasks table initialization failed:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeTasksTable();