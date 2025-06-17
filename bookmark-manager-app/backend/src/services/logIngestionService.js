import fs from 'fs';
import readline from 'readline';
import { Tail } from 'tail';
import pool from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';

class LogIngestionService {
  constructor() {
    this.logFilePath = '/home/halcasteel/BOOKMARKS/bookmark-manager-app/logs/unified.log';
    this.tail = null;
    this.batchSize = 100;
    this.batch = [];
    this.flushInterval = 5000; // Flush every 5 seconds
    this.lastProcessedLine = 0;
    this.isProcessing = false;
    
    // Register with unified logger
    unifiedLogger.registerService('log-ingestion', {
      type: 'service',
      description: 'Log ingestion and database pipeline'
    });
  }

  async initialize() {
    unifiedLogger.info('Initializing log ingestion service', {
      service: 'log-ingestion',
      source: 'initialize',
      config: {
        logFile: this.logFilePath,
        batchSize: this.batchSize,
        flushInterval: this.flushInterval
      }
    });

    try {
      // Create logs table if using PostgreSQL without TimescaleDB
      await this.ensureLogTable();
      
      // Process existing logs
      const existingCount = await this.processExistingLogs();
      unifiedLogger.info('Processed existing logs', {
        service: 'log-ingestion',
        source: 'initialize',
        count: existingCount
      });
      
      // Start tailing for new logs
      this.startTailing();
      
      // Set up batch flush interval
      this.flushIntervalId = setInterval(() => this.flushBatch(), this.flushInterval);
      
      unifiedLogger.info('Log ingestion service initialized successfully', {
        service: 'log-ingestion',
        source: 'initialize',
        status: 'ready'
      });
    } catch (error) {
      unifiedLogger.error('Failed to initialize log ingestion', error, {
        service: 'log-ingestion',
        source: 'initialize'
      });
      throw error;
    }
  }

  async ensureLogTable() {
    unifiedLogger.debug('Ensuring log table exists', {
      service: 'log-ingestion',
      source: 'ensureLogTable'
    });

    try {
      // Check if TimescaleDB is available
      const checkTimescale = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
        );
      `);
      
      const hasTimescale = checkTimescale.rows[0].exists;
      
      unifiedLogger.info('TimescaleDB status', {
        service: 'log-ingestion',
        source: 'ensureLogTable',
        hasTimescale
      });

      if (!hasTimescale) {
        // Create basic PostgreSQL table if TimescaleDB not available
        await pool.query(`
          CREATE TABLE IF NOT EXISTS system_logs (
            id BIGSERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            level VARCHAR(10) NOT NULL,
            service VARCHAR(50) NOT NULL,
            source VARCHAR(100),
            message TEXT NOT NULL,
            metadata JSONB,
            error_type VARCHAR(100),
            error_message TEXT,
            error_stack TEXT,
            user_id UUID,
            request_id VARCHAR(50),
            duration_ms INTEGER,
            status_code INTEGER
          );
          
          -- Create indexes
          CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level, timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_logs_service ON system_logs(service, timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_logs_error ON system_logs(error_type, timestamp DESC) WHERE error_type IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_logs_metadata ON system_logs USING GIN(metadata);
        `);
        
        unifiedLogger.info('Created PostgreSQL log table', {
          service: 'log-ingestion',
          source: 'ensureLogTable'
        });
      }
    } catch (error) {
      unifiedLogger.error('Failed to ensure log table', error, {
        service: 'log-ingestion',
        source: 'ensureLogTable'
      });
      throw error;
    }
  }

  async processExistingLogs() {
    const startTime = Date.now();
    unifiedLogger.info('Processing existing logs', {
      service: 'log-ingestion',
      source: 'processExistingLogs',
      file: this.logFilePath
    });

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(this.logFilePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      let lineNumber = 0;
      let processedCount = 0;

      rl.on('line', async (line) => {
        lineNumber++;
        if (lineNumber > this.lastProcessedLine) {
          const processed = await this.processLogLine(line);
          if (processed) processedCount++;
        }
      });

      rl.on('close', async () => {
        this.lastProcessedLine = lineNumber;
        await this.flushBatch();
        
        const duration = Date.now() - startTime;
        unifiedLogger.info('Completed processing existing logs', {
          service: 'log-ingestion',
          source: 'processExistingLogs',
          totalLines: lineNumber,
          processedLines: processedCount,
          durationMs: duration
        });
        
        resolve(processedCount);
      });

      rl.on('error', (error) => {
        unifiedLogger.error('Error reading log file', error, {
          service: 'log-ingestion',
          source: 'processExistingLogs'
        });
        reject(error);
      });
    });
  }

  startTailing() {
    unifiedLogger.info('Starting log file tail', {
      service: 'log-ingestion',
      source: 'startTailing',
      file: this.logFilePath
    });

    try {
      this.tail = new Tail(this.logFilePath, {
        fromBeginning: false,
        follow: true,
        logger: {
          info: () => {}, // Suppress Tail's own logging
          error: (msg) => unifiedLogger.error('Tail library error', new Error(msg), {
            service: 'log-ingestion',
            source: 'tail-library'
          })
        }
      });

      this.tail.on('line', (line) => {
        this.processLogLine(line);
      });

      this.tail.on('error', (error) => {
        unifiedLogger.error('Tail error', error, {
          service: 'log-ingestion',
          source: 'tail-error'
        });
      });

      unifiedLogger.info('Log tailing started', {
        service: 'log-ingestion',
        source: 'startTailing'
      });
    } catch (error) {
      unifiedLogger.error('Failed to start tailing', error, {
        service: 'log-ingestion',
        source: 'startTailing'
      });
      throw error;
    }
  }

  async processLogLine(line) {
    if (!line || line.trim() === '') return false;

    try {
      const logEntry = JSON.parse(line);
      
      // Don't ingest our own logs to avoid recursion
      if (logEntry.service === 'log-ingestion') {
        return false;
      }
      
      // Extract structured data
      const processedLog = {
        timestamp: logEntry.timestamp || new Date().toISOString(),
        level: logEntry.level || 'info',
        service: logEntry.service || 'unknown',
        source: logEntry.source || logEntry.metadata?.source,
        message: logEntry.message || '',
        metadata: logEntry.metadata || {},
        error_type: logEntry.metadata?.error?.type || logEntry.error?.type,
        error_message: logEntry.metadata?.error?.message || logEntry.error?.message,
        error_stack: logEntry.metadata?.error?.stack || logEntry.error?.stack,
        user_id: logEntry.metadata?.userId || logEntry.metadata?.user?.id,
        request_id: logEntry.metadata?.requestId || logEntry.metadata?.request?.requestId,
        duration_ms: this.extractDuration(logEntry),
        status_code: logEntry.metadata?.response?.statusCode || logEntry.metadata?.statusCode
      };

      this.batch.push(processedLog);

      // Flush if batch is full
      if (this.batch.length >= this.batchSize) {
        await this.flushBatch();
      }

      return true;
    } catch (error) {
      unifiedLogger.debug('Failed to parse log line', {
        service: 'log-ingestion',
        source: 'processLogLine',
        error: error.message,
        line: line.substring(0, 100) // First 100 chars only
      });
      return false;
    }
  }

  extractDuration(logEntry) {
    // Try various duration fields
    const duration = logEntry.metadata?.duration || 
                    logEntry.metadata?.response?.responseTime ||
                    logEntry.metadata?.performance?.duration ||
                    logEntry.metadata?.durationMs ||
                    logEntry.metadata?.duration_ms;
    
    if (!duration) return null;
    
    // Extract numeric value from strings like "123ms"
    const match = duration.toString().match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  async flushBatch() {
    if (this.batch.length === 0 || this.isProcessing) return;

    this.isProcessing = true;
    // Limit batch size to avoid exceeding PostgreSQL parameter limit
    const maxBatchSize = 100; // 100 logs * 13 params = 1300 params (well under PG limit)
    const logsToInsert = this.batch.splice(0, maxBatchSize);
    const startTime = Date.now();

    unifiedLogger.debug('Flushing log batch', {
      service: 'log-ingestion',
      source: 'flushBatch',
      batchSize: logsToInsert.length
    });

    try {
      const values = logsToInsert.map((log, index) => {
        const offset = index * 13;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
      }).join(', ');

      const flatParams = logsToInsert.flatMap(log => [
        log.timestamp,
        log.level,
        log.service,
        log.source,
        log.message,
        JSON.stringify(log.metadata),
        log.error_type,
        log.error_message,
        log.error_stack,
        log.user_id,
        log.request_id,
        log.duration_ms,
        log.status_code
      ]);

      // Skip if no logs to insert
      if (logsToInsert.length === 0) {
        return;
      }

      // Use a single insert with multiple values
      const query = `
        INSERT INTO system_logs (
          timestamp, level, service, source, message, metadata,
          error_type, error_message, error_stack, user_id, request_id,
          duration_ms, status_code
        ) VALUES ${values}
      `;
      
      await pool.query(query, flatParams);

      const duration = Date.now() - startTime;
      
      unifiedLogger.info('Log batch flushed successfully', {
        service: 'log-ingestion',
        source: 'flushBatch',
        batchSize: logsToInsert.length,
        durationMs: duration
      });

      // Update stats
      await this.updateAggregations(logsToInsert);

    } catch (error) {
      unifiedLogger.error('Failed to flush log batch', error, {
        service: 'log-ingestion',
        source: 'flushBatch',
        batchSize: logsToInsert.length
      });
      
      // Re-add failed logs to batch for retry
      this.batch = [...logsToInsert, ...this.batch];
    } finally {
      this.isProcessing = false;
    }
  }

  async updateAggregations(logs) {
    const startTime = Date.now();
    
    // Update real-time aggregations
    try {
      const hourlyStats = {};
      
      logs.forEach(log => {
        const hour = new Date(log.timestamp);
        hour.setMinutes(0, 0, 0);
        const hourKey = `${hour.toISOString()}_${log.service}_${log.level}`;
        
        if (!hourlyStats[hourKey]) {
          hourlyStats[hourKey] = {
            hour: hour.toISOString(),
            service: log.service,
            level: log.level,
            count: 0,
            error_count: 0,
            total_duration: 0,
            durations: [],
            unique_users: new Set()
          };
        }
        
        hourlyStats[hourKey].count++;
        if (log.level === 'error') hourlyStats[hourKey].error_count++;
        if (log.duration_ms) {
          hourlyStats[hourKey].total_duration += log.duration_ms;
          hourlyStats[hourKey].durations.push(log.duration_ms);
        }
        if (log.user_id) {
          hourlyStats[hourKey].unique_users.add(log.user_id);
        }
      });

      // Insert or update aggregations
      let updated = 0;
      for (const stats of Object.values(hourlyStats)) {
        const avgDuration = stats.durations.length > 0 
          ? stats.total_duration / stats.durations.length 
          : null;
        
        const p95Duration = stats.durations.length > 0
          ? this.calculatePercentile(stats.durations, 0.95)
          : null;

        await pool.query(`
          INSERT INTO log_aggregations (
            period_start, period_end, aggregation_type, service, level,
            total_count, error_count, avg_duration_ms, p95_duration_ms, unique_users
          ) VALUES ($1, $2, 'hourly', $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (period_start, period_end, aggregation_type, service, level)
          DO UPDATE SET
            total_count = log_aggregations.total_count + $5,
            error_count = log_aggregations.error_count + $6,
            avg_duration_ms = CASE 
              WHEN log_aggregations.avg_duration_ms IS NULL THEN $7
              ELSE (log_aggregations.avg_duration_ms * log_aggregations.total_count + $7 * $5) / (log_aggregations.total_count + $5)
            END,
            p95_duration_ms = GREATEST(log_aggregations.p95_duration_ms, $8),
            unique_users = log_aggregations.unique_users + $9
        `, [
          stats.hour,
          new Date(new Date(stats.hour).getTime() + 3600000).toISOString(),
          stats.service,
          stats.level,
          stats.count,
          stats.error_count,
          avgDuration,
          p95Duration,
          stats.unique_users.size
        ]);
        updated++;
      }

      const duration = Date.now() - startTime;
      unifiedLogger.debug('Updated aggregations', {
        service: 'log-ingestion',
        source: 'updateAggregations',
        statsUpdated: updated,
        durationMs: duration
      });
    } catch (error) {
      // Don't re-throw - aggregation errors shouldn't stop log ingestion
      unifiedLogger.error('Failed to update aggregations', error, {
        service: 'log-ingestion',
        source: 'updateAggregations'
      });
    }
  }

  calculatePercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index];
  }

  async stop() {
    unifiedLogger.info('Stopping log ingestion service', {
      service: 'log-ingestion',
      source: 'stop'
    });

    if (this.tail) {
      this.tail.unwatch();
    }
    
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
    }
    
    await this.flushBatch();
    
    unifiedLogger.info('Log ingestion service stopped', {
      service: 'log-ingestion',
      source: 'stop'
    });
  }

  // API methods for dashboard
  async getRecentLogs(limit = 100, filters = {}) {
    const startTime = Date.now();
    
    unifiedLogger.debug('Fetching recent logs', {
      service: 'log-ingestion',
      source: 'getRecentLogs',
      limit,
      filters
    });

    let query = 'SELECT * FROM system_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.level) {
      query += ` AND level = $${paramIndex++}`;
      params.push(filters.level);
    }

    if (filters.service) {
      query += ` AND service = $${paramIndex++}`;
      params.push(filters.service);
    }

    if (filters.startTime) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.startTime);
    }

    if (filters.endTime) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.endTime);
    }

    if (filters.search) {
      query += ` AND message ILIKE $${paramIndex++}`;
      params.push(`%${filters.search}%`);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(limit);

    try {
      const result = await pool.query(query, params);
      const duration = Date.now() - startTime;
      
      unifiedLogger.debug('Fetched recent logs', {
        service: 'log-ingestion',
        source: 'getRecentLogs',
        count: result.rows.length,
        durationMs: duration
      });
      
      return result.rows;
    } catch (error) {
      unifiedLogger.error('Failed to fetch recent logs', error, {
        service: 'log-ingestion',
        source: 'getRecentLogs',
        filters
      });
      throw error;
    }
  }

  async getLogStats(timeRange = '24h') {
    const startTime = Date.now();
    
    unifiedLogger.debug('Fetching log stats', {
      service: 'log-ingestion',
      source: 'getLogStats',
      timeRange
    });

    const intervals = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    const interval = intervals[timeRange] || '24 hours';

    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_logs,
          COUNT(CASE WHEN level = 'error' THEN 1 END) as error_count,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(duration_ms) as avg_duration,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration
        FROM system_logs
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
      `);

      const serviceBreakdown = await pool.query(`
        SELECT 
          service,
          COUNT(*) as count,
          COUNT(CASE WHEN level = 'error' THEN 1 END) as errors
        FROM system_logs
        WHERE timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY service
        ORDER BY count DESC
      `);

      const duration = Date.now() - startTime;
      
      const result = {
        ...stats.rows[0],
        error_rate: (stats.rows[0].error_count / stats.rows[0].total_logs * 100) || 0,
        services: serviceBreakdown.rows
      };

      unifiedLogger.info('Fetched log stats', {
        service: 'log-ingestion',
        source: 'getLogStats',
        timeRange,
        totalLogs: result.total_logs,
        errorRate: result.error_rate.toFixed(2),
        durationMs: duration
      });

      return result;
    } catch (error) {
      unifiedLogger.error('Failed to fetch log stats', error, {
        service: 'log-ingestion',
        source: 'getLogStats',
        timeRange
      });
      throw error;
    }
  }
}

// Create singleton instance
const logIngestionService = new LogIngestionService();

// Add start method for compatibility
logIngestionService.start = async function() {
  return this.initialize();
};

export default logIngestionService;