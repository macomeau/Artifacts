const Redis = require('ioredis');
const process = require('process');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Create Redis client
const redis = new Redis(process.env.REDIS_URL);

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Handle Redis connection success
redis.on('connect', () => {
  console.log('Connected to Redis server');
});

const queue = {
  dataDir: path.join(__dirname, 'data'),
  
  async initialize() {
    try {
      // Create data directory for fallback file storage
      await fs.mkdir(this.dataDir, { recursive: true });
      console.log('Queue data directory initialized');
      
      // Start periodic flush
      this.startPeriodicFlush();
      
      // Try to recover any data from previous runs
      await this.recoverFromFiles();
      
      console.log('Redis queue initialized');
    } catch (error) {
      console.error('Error initializing Redis queue:', error);
    }
  },
  
  async addInventorySnapshot(character, items) {
    try {
      const data = {
        character,
        items: JSON.stringify(items),
        timestamp: new Date().toISOString()
      };
      
      // Add to Redis list
      await redis.rpush('inventory_snapshots', JSON.stringify(data));
      
      // If queue gets too large, flush immediately
      const queueSize = await redis.llen('inventory_snapshots');
      if (queueSize > 100) {
        this.flush().catch(err => console.error('Error flushing queue:', err));
      }
    } catch (error) {
      console.error('Error adding inventory snapshot to Redis:', error);
      // Fallback to file storage
      await this.backupToFile('inventory_backup', [{
        character,
        items: JSON.stringify(items),
        timestamp: new Date()
      }]);
    }
  },
  
  async addActionLog(character, actionType, coordinates, result) {
    try {
      const data = {
        character,
        action_type: actionType,
        coordinates,
        result,
        timestamp: new Date().toISOString()
      };
      
      // Add to Redis list
      await redis.rpush('action_logs', JSON.stringify(data));
      
      // If queue gets too large, flush immediately
      const queueSize = await redis.llen('action_logs');
      if (queueSize > 100) {
        this.flush().catch(err => console.error('Error flushing queue:', err));
      }
    } catch (error) {
      console.error('Error adding action log to Redis:', error);
      // Fallback to file storage
      await this.backupToFile('action_backup', [{
        character,
        action_type: actionType,
        coordinates,
        result,
        timestamp: new Date()
      }]);
    }
  },
  
  // Generate a unique filename using process ID
  getUniqueFilename(prefix) {
    return `${prefix}_pid${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.json`;
  },
  
  async backupToFile(prefix, data) {
    try {
      if (data && data.length > 0) {
        const filename = this.getUniqueFilename(prefix);
        await fs.writeFile(
          path.join(this.dataDir, filename),
          JSON.stringify(data)
        );
        console.log(`Backed up data to file: ${filename}`);
      }
    } catch (error) {
      console.error('Error backing up queue to file:', error);
    }
  },
  
  async recoverFromFiles() {
    try {
      const files = await fs.readdir(this.dataDir);
      let recoveredInventory = 0;
      let recoveredActions = 0;
      
      for (const file of files) {
        try {
          if (file.startsWith('inventory_backup_')) {
            const content = await fs.readFile(path.join(this.dataDir, file), 'utf8');
            const items = JSON.parse(content);
            
            // Add each item to Redis
            for (const item of items) {
              await redis.rpush('inventory_snapshots', JSON.stringify(item));
              recoveredInventory++;
            }
            
            // Delete the file after successful recovery
            await fs.unlink(path.join(this.dataDir, file));
          } else if (file.startsWith('action_backup_')) {
            const content = await fs.readFile(path.join(this.dataDir, file), 'utf8');
            const actions = JSON.parse(content);
            
            // Add each action to Redis
            for (const action of actions) {
              await redis.rpush('action_logs', JSON.stringify(action));
              recoveredActions++;
            }
            
            // Delete the file after successful recovery
            await fs.unlink(path.join(this.dataDir, file));
          }
        } catch (fileError) {
          console.error(`Error processing backup file ${file}:`, fileError);
        }
      }
      
      if (recoveredInventory > 0 || recoveredActions > 0) {
        console.log(`Recovered ${recoveredInventory} inventory snapshots and ${recoveredActions} action logs from backup files`);
      }
    } catch (error) {
      console.error('Error recovering from backup files:', error);
    }
  },
  
  async flush() {
    // Check if there's anything to flush
    const inventorySize = await redis.llen('inventory_snapshots');
    const actionSize = await redis.llen('action_logs');
    
    if (inventorySize === 0 && actionSize === 0) {
      return;
    }
    
    // Backup to file before attempting database flush
    if (inventorySize > 0) {
      const inventoryItems = await redis.lrange('inventory_snapshots', 0, -1);
      await this.backupToFile('inventory_backup', inventoryItems.map(item => JSON.parse(item)));
    }
    
    if (actionSize > 0) {
      const actionItems = await redis.lrange('action_logs', 0, -1);
      await this.backupToFile('action_backup', actionItems.map(item => JSON.parse(item)));
    }
    
    const db = require('./db');
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Batch insert inventory snapshots
      if (inventorySize > 0) {
        const inventoryItems = await redis.lrange('inventory_snapshots', 0, -1);
        const parsedItems = inventoryItems.map(item => JSON.parse(item));
        
        const values = parsedItems.map((_, index) => 
          `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`
        ).join(', ');
        
        const params = parsedItems.flatMap(snapshot => [
          snapshot.character,
          snapshot.items,
          new Date(snapshot.timestamp)
        ]);
        
        if (params.length > 0) {
          await client.query(
            `INSERT INTO inventory_snapshots(character, items, timestamp)
             VALUES ${values}`,
            params
          );
        }
      }
      
      // Batch insert action logs
      if (actionSize > 0) {
        const actionItems = await redis.lrange('action_logs', 0, -1);
        const parsedActions = actionItems.map(item => JSON.parse(item));
        
        const values = parsedActions.map((_, index) => 
          `($${index * 5 + 1}, $${index * 5 + 2}, point($${index * 5 + 3},$${index * 5 + 4}), $${index * 5 + 5}, $${index * 5 + 6})`
        ).join(', ');
        
        const params = parsedActions.flatMap(log => [
          log.character,
          log.action_type,
          log.coordinates ? log.coordinates.x : 0,
          log.coordinates ? log.coordinates.y : 0,
          log.result ? JSON.stringify(log.result) : null,
          new Date(log.timestamp)
        ]);
        
        if (params.length > 0) {
          await client.query(
            `INSERT INTO action_logs(character, action_type, coordinates, result, timestamp)
             VALUES ${values}`,
            params
          );
        }
      }
      
      await client.query('COMMIT');
      
      // Clear Redis queues after successful commit
      if (inventorySize > 0) {
        await redis.del('inventory_snapshots');
      }
      
      if (actionSize > 0) {
        await redis.del('action_logs');
      }
      
      console.log(`Successfully flushed queue to database: ${inventorySize} inventory items, ${actionSize} action logs`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error flushing queue to database:', error);
    } finally {
      client.release();
    }
  },
  
  // Start periodic flush
  startPeriodicFlush() {
    const flushInterval = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    setInterval(async () => {
      try {
        await this.flush();
      } catch (error) {
        console.error('Error in periodic flush:', error);
      }
    }, flushInterval);
    
    // Also backup to file more frequently than database flush
    setInterval(async () => {
      try {
        const inventorySize = await redis.llen('inventory_snapshots');
        const actionSize = await redis.llen('action_logs');
        
        if (inventorySize > 0) {
          const inventoryItems = await redis.lrange('inventory_snapshots', 0, -1);
          await this.backupToFile('inventory_backup', inventoryItems.map(item => JSON.parse(item)));
        }
        
        if (actionSize > 0) {
          const actionItems = await redis.lrange('action_logs', 0, -1);
          await this.backupToFile('action_backup', actionItems.map(item => JSON.parse(item)));
        }
      } catch (error) {
        console.error('Error in periodic backup:', error);
      }
    }, 60 * 1000); // Every minute
    
    console.log(`Redis queue initialized with flush interval of ${flushInterval/60000} minutes`);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, flushing queue before exit...');
  try {
    await queue.flush();
    await redis.quit();
  } catch (error) {
    console.error('Error flushing queue during shutdown:', error);
    // Backup to file as last resort
    try {
      const inventorySize = await redis.llen('inventory_snapshots');
      const actionSize = await redis.llen('action_logs');
      
      if (inventorySize > 0) {
        const inventoryItems = await redis.lrange('inventory_snapshots', 0, -1);
        await queue.backupToFile('inventory_backup', inventoryItems.map(item => JSON.parse(item)));
      }
      
      if (actionSize > 0) {
        const actionItems = await redis.lrange('action_logs', 0, -1);
        await queue.backupToFile('action_backup', actionItems.map(item => JSON.parse(item)));
      }
    } catch (backupError) {
      console.error('Error backing up to file during shutdown:', backupError);
    }
    await redis.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, flushing queue before exit...');
  try {
    await queue.flush();
    await redis.quit();
  } catch (error) {
    console.error('Error flushing queue during shutdown:', error);
    // Backup to file as last resort
    try {
      const inventorySize = await redis.llen('inventory_snapshots');
      const actionSize = await redis.llen('action_logs');
      
      if (inventorySize > 0) {
        const inventoryItems = await redis.lrange('inventory_snapshots', 0, -1);
        await queue.backupToFile('inventory_backup', inventoryItems.map(item => JSON.parse(item)));
      }
      
      if (actionSize > 0) {
        const actionItems = await redis.lrange('action_logs', 0, -1);
        await queue.backupToFile('action_backup', actionItems.map(item => JSON.parse(item)));
      }
    } catch (backupError) {
      console.error('Error backing up to file during shutdown:', backupError);
    }
    await redis.quit();
  }
  process.exit(0);
});

module.exports = queue;
