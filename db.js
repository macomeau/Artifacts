/**
 * @fileoverview Database utilities for interacting with PostgreSQL.
 * @module db
 */

const { Pool } = require('pg');
// env-loader is now loaded in config.js before db.js is imported

/**
 * PostgreSQL connection pool
 * @type {Pool}
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * Database utility functions
 * @exports db
 */
module.exports = {
  /**
   * Execute a parameterized SQL query
   * @param {string} text - SQL query text with parameter placeholders
   * @param {Array} params - Array of parameter values
   * @returns {Promise<Object>} Query result
   */
  query: (text, params) => pool.query(text, params),
  
  /**
   * Get a client from the connection pool
   * @returns {Promise<PoolClient>} Database client
   */
  getClient: () => pool.connect(),
  
  /**
   * Creates database tables, indexes, and triggers for logging actions and inventory snapshots.
   * Sets up automatic pruning mechanisms to prevent unlimited database growth.
   * @returns {Promise<void>}
   */
  createTables: async () => {
    // Create tables and indexes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS action_logs (
        id SERIAL PRIMARY KEY,
        character VARCHAR(255) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        coordinates POINT,
        result JSONB,
        error TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id SERIAL PRIMARY KEY,
        character VARCHAR(255) NOT NULL,
        items JSONB NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS action_logs_timestamp_idx 
      ON action_logs (timestamp DESC);

      CREATE INDEX IF NOT EXISTS inventory_snapshots_timestamp_idx
      ON inventory_snapshots (timestamp DESC);
    `);

    // Create functions for automatic pruning
    await pool.query(`
      -- Function to prune action_logs table
      CREATE OR REPLACE FUNCTION prune_action_logs()
      RETURNS TRIGGER AS $$
      BEGIN
        DELETE FROM action_logs
        WHERE id NOT IN (
          SELECT id FROM action_logs
          ORDER BY id DESC
          LIMIT 10000
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to prune inventory_snapshots table
      CREATE OR REPLACE FUNCTION prune_inventory_snapshots()
      RETURNS TRIGGER AS $$
      BEGIN
        DELETE FROM inventory_snapshots
        WHERE id NOT IN (
          SELECT id FROM inventory_snapshots
          ORDER BY id DESC
          LIMIT 10000
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create counter table for pruning
    await pool.query(`
      -- Create a counter table for tracking inserts
      CREATE TABLE IF NOT EXISTS pruning_counters (
        table_name VARCHAR(50) PRIMARY KEY,
        counter INT DEFAULT 0
      );
      
      -- Initialize counters if they don't exist
      INSERT INTO pruning_counters (table_name, counter)
      VALUES ('action_logs', 0), ('inventory_snapshots', 0)
      ON CONFLICT (table_name) DO NOTHING;
    `);

    // Create counter function for triggering pruning
    await pool.query(`
      -- Function to increment counter and check for pruning
      CREATE OR REPLACE FUNCTION increment_and_check_counter()
      RETURNS TRIGGER AS $$
      DECLARE
        current_count INT;
        threshold INT;
      BEGIN
        -- Set threshold based on table
        IF TG_TABLE_NAME = 'action_logs' THEN
          threshold := 1000;
        ELSE
          threshold := 500;
        END IF;
        
        -- Update counter
        UPDATE pruning_counters 
        SET counter = counter + 1 
        WHERE table_name = TG_TABLE_NAME
        RETURNING counter INTO current_count;
        
        -- Reset counter and trigger pruning if threshold reached
        IF current_count >= threshold THEN
          UPDATE pruning_counters 
          SET counter = 0
          WHERE table_name = TG_TABLE_NAME;
          
          -- Prune based on table name
          IF TG_TABLE_NAME = 'action_logs' THEN
            DELETE FROM action_logs
            WHERE id NOT IN (
              SELECT id FROM action_logs
              ORDER BY id DESC
              LIMIT 10000
            );
          ELSE
            DELETE FROM inventory_snapshots
            WHERE id NOT IN (
              SELECT id FROM inventory_snapshots
              ORDER BY id DESC
              LIMIT 10000
            );
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create triggers
    try {
      // First drop existing triggers if they exist
      await pool.query(`
        DROP TRIGGER IF EXISTS action_logs_counter_trigger ON action_logs;
        DROP TRIGGER IF EXISTS inventory_snapshots_counter_trigger ON inventory_snapshots;
      `);

      // Create new triggers
      await pool.query(`
        -- Trigger for action_logs table
        CREATE TRIGGER action_logs_counter_trigger
        AFTER INSERT ON action_logs
        FOR EACH ROW
        EXECUTE FUNCTION increment_and_check_counter();

        -- Trigger for inventory_snapshots table
        CREATE TRIGGER inventory_snapshots_counter_trigger
        AFTER INSERT ON inventory_snapshots
        FOR EACH ROW
        EXECUTE FUNCTION increment_and_check_counter();
      `);
      
      console.log('Created pruning triggers successfully');
    } catch (error) {
      console.error('Error creating pruning triggers:', error.message);
      // Continue even if we can't create triggers
    }
  },
  
  /**
   * Manually prunes old logs to prevent database bloat.
   * Keeps only the most recent 10,000 records in each log table.
   * @returns {Promise<void>}
   */
  pruneOldLogs: async () => {
    try {
      // Manually prune logs (for direct calls)
      await pool.query(`
        DELETE FROM action_logs
        WHERE id NOT IN (
          SELECT id FROM action_logs
          ORDER BY id DESC
          LIMIT 10000
        );
        
        DELETE FROM inventory_snapshots 
        WHERE id NOT IN (
          SELECT id FROM inventory_snapshots
          ORDER BY id DESC
          LIMIT 10000
        );
      `);
      
      console.log('Successfully manually pruned old logs');
    } catch (error) {
      console.error('Error manually pruning logs:', error.message);
      console.log('Automatic triggers should still handle pruning on future inserts');
      // Don't throw the error to prevent script termination
    }
  }
};