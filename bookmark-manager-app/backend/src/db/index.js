import pg from 'pg';
import pgvector from 'pgvector/pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import unifiedLogger, { createDatabaseLogger } from '../services/unifiedLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
dotenv.config({ path: join(__dirname, '../../../.env') });

const { Pool } = pg;

// For now, use the main logger for database operations
const dbLogger = unifiedLogger;

// Log database configuration (without sensitive data)
const dbConfig = {
  host: process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] || 'unknown',
  database: process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] || 'unknown',
  ssl: process.env.NODE_ENV === 'production',
  maxConnections: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};

dbLogger.info('Initializing database pool', {
  service: 'database',
  source: 'init',
  config: dbConfig
});

// Configure the connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Register pgvector type and log connection
pool.on('connect', async (client) => {
  await pgvector.registerType(client);
  dbLogger.info('Database connection established', {
    service: 'database',
    source: 'pool-connect',
    database: process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] || 'unknown'
  });
});

pool.on('error', (err, client) => {
  dbLogger.error('Database pool error', {
    service: 'database',
    source: 'pool-error',
    error: err.message,
    code: err.code,
    detail: err.detail,
    stack: err.stack,
    hasClient: !!client
  });
  
  // Only exit on critical errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    dbLogger.error('Critical database connection error - exiting', {
      service: 'database',
      source: 'pool-error-critical',
      code: err.code
    });
    process.exit(-1);
  }
});

// Additional pool event listeners for comprehensive monitoring
pool.on('acquire', (client) => {
  dbLogger.debug('Client acquired from pool', {
    service: 'database',
    source: 'pool-acquire',
    poolStatus: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    }
  });
});

pool.on('remove', (client) => {
  dbLogger.debug('Client removed from pool', {
    service: 'database',
    source: 'pool-remove',
    poolStatus: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    }
  });
});

// Helper functions with logging
export const query = async (text, params) => {
  const startTime = Date.now();
  const queryId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Log query execution
    dbLogger.debug('Executing query', {
      service: 'database',
      source: 'query',
      queryId,
      query: text.substring(0, 200),
      paramCount: params?.length || 0,
      hasParams: !!params
    });
    
    const result = await pool.query(text, params);
    const duration = Date.now() - startTime;
    
    // Log slow queries as warnings
    if (duration > 1000) {
      dbLogger.warn('Slow query detected', {
        service: 'database',
        source: 'query',
        queryId,
        duration,
        query: text.substring(0, 200),
        rowCount: result.rowCount,
        command: result.command
      });
    } else {
      // Log normal query completion
      dbLogger.debug('Query completed', {
        service: 'database',
        source: 'query',
        queryId,
        duration,
        rowCount: result.rowCount,
        command: result.command
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log query failure
    dbLogger.error('Query failed', {
      service: 'database',
      source: 'query',
      queryId,
      duration,
      query: text.substring(0, 200),
      error: error.message || String(error),
      code: error.code || 'UNKNOWN',
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      stack: error.stack
    });
    
    throw error;
  }
};

export const getClient = async () => {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    dbLogger.debug('Acquiring database client', {
      service: 'database',
      source: 'getClient',
      clientId
    });
    
    const client = await pool.connect();
    
    dbLogger.debug('Database client acquired', {
      service: 'database',
      source: 'getClient',
      clientId,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    });
    
    return client;
  } catch (error) {
    dbLogger.error('Failed to acquire database client', {
      service: 'database',
      source: 'getClient',
      clientId,
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error;
  }
};

// Transaction helper with logging
export const transaction = async (callback) => {
  const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  let client;
  
  try {
    dbLogger.debug('Acquiring client for transaction', {
      service: 'database',
      source: 'transaction',
      transactionId
    });
    
    client = await getClient();
    
    dbLogger.info('Starting transaction', {
      service: 'database',
      source: 'transaction',
      transactionId
    });
    
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    
    const duration = Date.now() - startTime;
    dbLogger.info('Transaction committed', {
      service: 'database',
      source: 'transaction',
      transactionId,
      duration
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    try {
      if (client) {
        await client.query('ROLLBACK');
        dbLogger.error('Transaction rolled back', {
          service: 'database',
          source: 'transaction',
          transactionId,
          duration,
          error: error.message,
          code: error.code,
          detail: error.detail,
          stack: error.stack
        });
      } else {
        dbLogger.error('Transaction failed before client acquired', {
          service: 'database',
          source: 'transaction',
          transactionId,
          duration,
          error: error.message,
          stack: error.stack
        });
      }
    } catch (rollbackError) {
      dbLogger.error('Failed to rollback transaction', {
        service: 'database',
        source: 'transaction',
        transactionId,
        duration,
        originalError: error.message,
        rollbackError: rollbackError.message,
        stack: rollbackError.stack
      });
    }
    
    throw error;
  } finally {
    if (client) {
      try {
        client.release();
        dbLogger.debug('Transaction client released', {
          service: 'database',
          source: 'transaction',
          transactionId
        });
      } catch (releaseError) {
        dbLogger.error('Failed to release transaction client', {
          service: 'database',
          source: 'transaction',
          transactionId,
          error: releaseError.message,
          stack: releaseError.stack
        });
      }
    }
  }
};

// Vector operations with logging
export const createEmbedding = (array) => {
  try {
    dbLogger.debug('Creating embedding', {
      service: 'database',
      source: 'createEmbedding',
      arrayLength: array?.length || 0
    });
    
    return pgvector.toSql(array);
  } catch (error) {
    dbLogger.error('Failed to create embedding', {
      service: 'database',
      source: 'createEmbedding',
      error: error.message,
      arrayLength: array?.length || 0,
      stack: error.stack
    });
    throw error;
  }
};

export const parseEmbedding = (embedding) => {
  try {
    dbLogger.debug('Parsing embedding', {
      service: 'database',
      source: 'parseEmbedding',
      hasEmbedding: !!embedding
    });
    
    return pgvector.fromSql(embedding);
  } catch (error) {
    dbLogger.error('Failed to parse embedding', {
      service: 'database',
      source: 'parseEmbedding',
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Pool status monitoring
export const getPoolStatus = () => {
  const status = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
  
  dbLogger.debug('Pool status requested', {
    service: 'database',
    source: 'getPoolStatus',
    ...status
  });
  
  return status;
};

// Graceful shutdown
export const closePool = async () => {
  try {
    dbLogger.info('Closing database pool', {
      service: 'database',
      source: 'closePool',
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    });
    
    await pool.end();
    
    dbLogger.info('Database pool closed successfully', {
      service: 'database',
      source: 'closePool'
    });
  } catch (error) {
    dbLogger.error('Failed to close database pool', {
      service: 'database',
      source: 'closePool',
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Health check
export const healthCheck = async () => {
  const startTime = Date.now();
  
  try {
    dbLogger.debug('Performing database health check', {
      service: 'database',
      source: 'healthCheck'
    });
    
    const result = await query('SELECT 1 as health');
    const duration = Date.now() - startTime;
    
    const healthy = result.rows[0]?.health === 1;
    
    dbLogger.info('Database health check completed', {
      service: 'database',
      source: 'healthCheck',
      healthy,
      duration,
      poolStatus: getPoolStatus()
    });
    
    return {
      healthy,
      duration,
      poolStatus: getPoolStatus()
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    dbLogger.error('Database health check failed', {
      service: 'database',
      source: 'healthCheck',
      duration,
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    
    return {
      healthy: false,
      duration,
      error: error.message,
      poolStatus: getPoolStatus()
    };
  }
};

export default pool;