const fs = require('fs').promises;
const path = require('path');
const process = require('process'); // Add process module for PID

const queue = {
  inventorySnapshots: [],
  actionLogs: [],
  lastFlush: Date.now(),
  flushInterval: 10 * 60 * 1000, // 10 minutes in milliseconds
  dataDir: path.join(__dirname, 'data'),
  
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('Queue data directory initialized');
      
      // Start periodic flush
      this.startPeriodicFlush();
      
      // Try to recover any data from previous runs
      await this.recoverFromFiles();
    } catch (error) {
      console.error('Error initializing queue:', error);
    }
  },
  
  addInventorySnapshot(character, items) {
    this.inventorySnapshots.push({
      character,
      items: JSON.stringify(items),
      timestamp: new Date()
    });
    
    // If queue gets too large, flush immediately
    if (this.inventorySnapshots.length > 100) {
      this.flush().catch(err => console.error('Error flushing queue:', err));
    }
  },
  
  addActionLog(character, actionType, coordinates, result) {
    this.actionLogs.push({
      character,
      action_type: actionType,
      coordinates,
      result,
      timestamp: new Date()
    });
    
    // If queue gets too large, flush immediately
    if (this.actionLogs.length > 100) {
      this.flush().catch(err => console.error('Error flushing queue:', err));
    }
  },
  
  // Generate a unique filename using process ID
  getUniqueFilename(prefix) {
    return `${prefix}_pid${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.json`;
  },
  
  async backupToFile() {
    try {
      if (this.inventorySnapshots.length > 0) {
        const filename = this.getUniqueFilename('inventory_backup');
        await fs.writeFile(
          path.join(this.dataDir, filename),
          JSON.stringify(this.inventorySnapshots)
        );
      }
      
      if (this.actionLogs.length > 0) {
        const filename = this.getUniqueFilename('action_backup');
        await fs.writeFile(
          path.join(this.dataDir, filename),
          JSON.stringify(this.actionLogs)
        );
      }
    } catch (error) {
      console.error('Error backing up queue to file:', error);
    }
  },
  
  async recoverFromFiles() {
    try {
      const files = await fs.readdir(this.dataDir);
      
      for (const file of files) {
        if (file.startsWith('inventory_backup_')) {
          const content = await fs.readFile(path.join(this.dataDir, file), 'utf8');
          this.inventorySnapshots = [...this.inventorySnapshots, ...JSON.parse(content)];
          await fs.unlink(path.join(this.dataDir, file));
        } else if (file.startsWith('action_backup_')) {
          const content = await fs.readFile(path.join(this.dataDir, file), 'utf8');
          this.actionLogs = [...this.actionLogs, ...JSON.parse(content)];
          await fs.unlink(path.join(this.dataDir, file));
        }
      }
      
      if (this.inventorySnapshots.length > 0 || this.actionLogs.length > 0) {
        console.log(`Recovered ${this.inventorySnapshots.length} inventory snapshots and ${this.actionLogs.length} action logs from backup files`);
      }
    } catch (error) {
      console.error('Error recovering from backup files:', error);
    }
  },
  
  async flush() {
    if (this.inventorySnapshots.length === 0 && this.actionLogs.length === 0) {
      return;
    }
    
    // Backup to file before attempting database flush
    await this.backupToFile();
    
    const db = require('./db');
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Batch insert inventory snapshots
      if (this.inventorySnapshots.length > 0) {
        const values = this.inventorySnapshots.map((snapshot, index) => 
          `($${index * 2 + 1}, $${index * 2 + 2})`
        ).join(', ');
        
        const params = this.inventorySnapshots.flatMap(snapshot => 
          [snapshot.character, snapshot.items]
        );
        
        await client.query(
          `INSERT INTO inventory_snapshots(character, items)
           VALUES ${values}`,
          params
        );
      }
      
      // Batch insert action logs
      if (this.actionLogs.length > 0) {
        const values = this.actionLogs.map((log, index) => 
          `($${index * 4 + 1}, $${index * 4 + 2}, point($${index * 4 + 3},$${index * 4 + 4}), $${index * 4 + 5})`
        ).join(', ');
        
        const params = this.actionLogs.flatMap(log => [
          log.character,
          log.action_type,
          log.coordinates ? log.coordinates.x : 0,
          log.coordinates ? log.coordinates.y : 0,
          log.result ? JSON.stringify(log.result) : null
        ]);
        
        await client.query(
          `INSERT INTO action_logs(character, action_type, coordinates, result)
           VALUES ${values}`,
          params
        );
      }
      
      await client.query('COMMIT');
      
      // Clear queues after successful commit
      this.inventorySnapshots = [];
      this.actionLogs = [];
      this.lastFlush = Date.now();
      
      console.log('Successfully flushed queue to database');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error flushing queue to database:', error);
    } finally {
      client.release();
    }
  },
  
  // Start periodic flush
  startPeriodicFlush() {
    setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        console.error('Error in periodic flush:', error);
      }
    }, this.flushInterval);
    
    // Also backup to file more frequently than database flush
    setInterval(async () => {
      try {
        await this.backupToFile();
      } catch (error) {
        console.error('Error in periodic backup:', error);
      }
    }, 60 * 1000); // Every minute
    
    console.log(`Queue initialized with flush interval of ${this.flushInterval/60000} minutes`);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, flushing queue before exit...');
  try {
    await queue.flush();
  } catch (error) {
    console.error('Error flushing queue during shutdown:', error);
    // Backup to file as last resort
    await queue.backupToFile();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, flushing queue before exit...');
  try {
    await queue.flush();
  } catch (error) {
    console.error('Error flushing queue during shutdown:', error);
    // Backup to file as last resort
    await queue.backupToFile();
  }
  process.exit(0);
});

module.exports = queue;
