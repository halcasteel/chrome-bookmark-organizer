import pg from 'pg';
import dotenv from 'dotenv';
import unifiedLogger from '../services/unifiedLogger.js';

dotenv.config();

const { Pool } = pg;

/**
 * PostgreSQL connection pool configuration
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5434/bookmark_manager',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Log pool events
pool.on('connect', () => {
  unifiedLogger.info('Database pool: client connected');
});

pool.on('error', (err) => {
  unifiedLogger.error('Database pool error', { error: err.message, stack: err.stack });
});

/**
 * Query the database
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries
    if (duration > 1000) {
      unifiedLogger.info('Slow query detected', {
        query: text,
        duration,
        rows: res.rowCount,
      });
    }
    
    return res;
  } catch (error) {
    unifiedLogger.error('Database query error', {
      error: error.message,
      stack: error.stack,
      query: text,
      params,
    });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
export const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    unifiedLogger.error('A client has been checked out for more than 5 seconds!', {
      service: 'database',
      source: 'client-timeout'
    });
  }, 5000);
  
  // Monkey patch the query method to keep track of the last query executed
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };
  
  client.release = () => {
    // Clear our timeout
    clearTimeout(timeout);
    // Set the methods back to their old un-monkey-patched version
    client.query = query;
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

/**
 * Check database connection
 * @returns {Promise<boolean>} Connection status
 */
export const checkConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    logInfo('Database connection verified', { timestamp: result.rows[0].now });
    return true;
  } catch (error) {
    logError(error, { context: 'Database connection check failed' });
    return false;
  }
};

/**
 * Close the database pool
 * @returns {Promise<void>}
 */
export const closePool = async () => {
  await pool.end();
  logInfo('Database pool closed');
};

export default {
  query,
  getClient,
  checkConnection,
  closePool,
};