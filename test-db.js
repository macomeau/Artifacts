const db = require('./db');

async function testConnection() {
  try {
    const res = await db.query('SELECT NOW() AS current_time');
    console.log('Database connection successful. Current time:', res.rows[0].current_time);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await db.pool.end();
  }
}

testConnection();
