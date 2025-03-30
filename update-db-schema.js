/**
 * @fileoverview Script to update database schema with missing columns
 * Use node update-db-schema.js in the terminal to execute the script.
 */

const { Pool } = require('pg');
require('dotenv').config();

async function addErrorColumnIfMissing() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Checking if error column exists in action_logs table...');
    
    // Check if column exists
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='action_logs' AND column_name='error'
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('Error column does not exist. Adding it now...');
      
      // Add the column if it doesn't exist
      await pool.query(`
        ALTER TABLE action_logs 
        ADD COLUMN IF NOT EXISTS error TEXT
      `);
      
      console.log('Successfully added error column to action_logs table.');
    } else {
      console.log('Error column already exists in action_logs table.');
    }
  } catch (error) {
    console.error('Error updating database schema:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute the update
addErrorColumnIfMissing()
  .then(() => console.log('Database schema update completed.'))
  .catch(error => {
    console.error('Database schema update failed:', error);
    process.exit(1);
  });