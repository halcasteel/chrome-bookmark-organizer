import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';

/**
 * Database utilities for optimized operations
 */

/**
 * Execute multiple queries in a single transaction
 * @param {Array} queries - Array of {text, values} objects
 * @returns {Array} - Results of all queries
 */
export async function executeInTransaction(queries) {
  const client = await db.pool.connect();
  const results = [];
  
  try {
    await client.query('BEGIN');
    
    for (const query of queries) {
      const result = await client.query(query.text, query.values);
      results.push(result);
    }
    
    await client.query('COMMIT');
    
    unifiedLogger.debug('Transaction completed successfully', {
      service: 'databaseUtils',
      method: 'executeInTransaction',
      queryCount: queries.length
    });
    
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    
    unifiedLogger.error('Transaction failed, rolled back', {
      service: 'databaseUtils',
      method: 'executeInTransaction',
      error: error.message
    });
    
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Batch insert records efficiently
 * @param {string} tableName - Table to insert into
 * @param {Array} records - Records to insert
 * @param {Array} columns - Column names
 * @param {Object} options - Insert options
 * @returns {number} - Number of inserted records
 */
export async function batchInsert(tableName, records, columns, options = {}) {
  if (!records || records.length === 0) {
    return 0;
  }
  
  const {
    onConflict = '',
    returning = false,
    chunkSize = 1000
  } = options;
  
  let totalInserted = 0;
  const allResults = [];
  
  // Process in chunks to avoid query size limits
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    
    // Build values clause
    const valuesClauses = [];
    const allValues = [];
    let paramIndex = 1;
    
    for (const record of chunk) {
      const placeholders = columns.map(() => `$${paramIndex++}`).join(', ');
      valuesClauses.push(`(${placeholders})`);
      
      for (const column of columns) {
        allValues.push(record[column]);
      }
    }
    
    // Build query
    let query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${valuesClauses.join(', ')}
    `;
    
    if (onConflict) {
      query += ` ${onConflict}`;
    }
    
    if (returning) {
      query += ` RETURNING *`;
    }
    
    try {
      const result = await db.query(query, allValues);
      totalInserted += result.rowCount;
      
      if (returning) {
        allResults.push(...result.rows);
      }
    } catch (error) {
      unifiedLogger.error('Batch insert failed', {
        service: 'databaseUtils',
        method: 'batchInsert',
        tableName,
        chunkIndex: i / chunkSize,
        error: error.message
      });
      throw error;
    }
  }
  
  unifiedLogger.info('Batch insert completed', {
    service: 'databaseUtils',
    method: 'batchInsert',
    tableName,
    totalRecords: records.length,
    totalInserted,
    chunks: Math.ceil(records.length / chunkSize)
  });
  
  return returning ? allResults : totalInserted;
}

/**
 * Batch update records efficiently
 * @param {string} tableName - Table to update
 * @param {Array} updates - Array of {id, data} objects
 * @param {Object} options - Update options
 * @returns {number} - Number of updated records
 */
export async function batchUpdate(tableName, updates, options = {}) {
  if (!updates || updates.length === 0) {
    return 0;
  }
  
  const {
    idColumn = 'id',
    updateColumns = null,
    chunkSize = 500
  } = options;
  
  let totalUpdated = 0;
  
  // Process in chunks
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const queries = [];
    
    for (const update of chunk) {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;
      
      // Determine columns to update
      const columnsToUpdate = updateColumns || Object.keys(update.data);
      
      for (const column of columnsToUpdate) {
        if (update.data.hasOwnProperty(column)) {
          setClauses.push(`${column} = $${paramIndex++}`);
          values.push(update.data[column]);
        }
      }
      
      // Add ID value
      values.push(update.id);
      
      if (setClauses.length > 0) {
        queries.push({
          text: `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${paramIndex}`,
          values
        });
      }
    }
    
    // Execute chunk in transaction
    if (queries.length > 0) {
      const results = await executeInTransaction(queries);
      totalUpdated += results.reduce((sum, r) => sum + r.rowCount, 0);
    }
  }
  
  unifiedLogger.info('Batch update completed', {
    service: 'databaseUtils',
    method: 'batchUpdate',
    tableName,
    totalRecords: updates.length,
    totalUpdated,
    chunks: Math.ceil(updates.length / chunkSize)
  });
  
  return totalUpdated;
}

/**
 * Create indexes if they don't exist
 * @param {Array} indexes - Array of index definitions
 */
export async function ensureIndexes(indexes) {
  for (const index of indexes) {
    const { name, table, columns, unique = false, where = null } = index;
    
    try {
      // Check if index exists
      const existsResult = await db.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
        [name]
      );
      
      if (existsResult.rows.length === 0) {
        // Create index
        let query = `CREATE ${unique ? 'UNIQUE' : ''} INDEX CONCURRENTLY ${name} ON ${table} (${columns.join(', ')})`;
        
        if (where) {
          query += ` WHERE ${where}`;
        }
        
        await db.query(query);
        
        unifiedLogger.info('Index created', {
          service: 'databaseUtils',
          method: 'ensureIndexes',
          indexName: name,
          table,
          columns
        });
      }
    } catch (error) {
      unifiedLogger.error('Failed to create index', {
        service: 'databaseUtils',
        method: 'ensureIndexes',
        indexName: name,
        error: error.message
      });
      // Don't throw - index creation failure shouldn't break the app
    }
  }
}

/**
 * Optimize common bookmark queries with indexes
 */
export async function optimizeBookmarkQueries() {
  const indexes = [
    {
      name: 'idx_bookmarks_user_id_created_at',
      table: 'bookmarks',
      columns: ['user_id', 'created_at DESC']
    },
    {
      name: 'idx_bookmarks_user_id_is_deleted',
      table: 'bookmarks',
      columns: ['user_id', 'is_deleted'],
      where: 'is_deleted = false'
    },
    {
      name: 'idx_bookmarks_user_id_is_valid',
      table: 'bookmarks',
      columns: ['user_id', 'is_valid']
    },
    {
      name: 'idx_bookmarks_url_hash',
      table: 'bookmarks',
      columns: ['url_hash']
    },
    {
      name: 'idx_bookmarks_category_id',
      table: 'bookmarks',
      columns: ['category_id'],
      where: 'category_id IS NOT NULL'
    },
    {
      name: 'idx_bookmarks_folder_id',
      table: 'bookmarks',
      columns: ['folder_id'],
      where: 'folder_id IS NOT NULL'
    }
  ];
  
  await ensureIndexes(indexes);
}

/**
 * Get connection pool statistics
 */
export function getPoolStats() {
  const pool = db.pool;
  
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}