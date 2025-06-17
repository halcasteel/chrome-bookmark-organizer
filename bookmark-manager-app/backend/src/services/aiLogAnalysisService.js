import pool from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';
import openaiService from './openaiService.js';

class AILogAnalysisService {
  constructor() {
    this.analysisInterval = 300000; // 5 minutes
    this.isAnalyzing = false;
    
    // Register with unified logger
    unifiedLogger.registerService('ai-log-analysis', {
      type: 'service',
      description: 'AI-powered log analysis and anomaly detection'
    });
  }

  async initialize() {
    unifiedLogger.info('Initializing AI log analysis service', {
      service: 'ai-log-analysis',
      source: 'initialize',
      interval: this.analysisInterval
    });

    // Start periodic analysis
    this.startPeriodicAnalysis();
  }

  startPeriodicAnalysis() {
    setInterval(async () => {
      if (!this.isAnalyzing) {
        await this.analyzeRecentLogs('5m', 'auto');
      }
    }, this.analysisInterval);
  }

  async analyzeRecentLogs(timeRange = '1h', analysisType = 'anomaly') {
    if (this.isAnalyzing) {
      unifiedLogger.warn('Analysis already in progress', {
        service: 'ai-log-analysis',
        source: 'analyzeRecentLogs'
      });
      return null;
    }

    this.isAnalyzing = true;
    const startTime = Date.now();

    unifiedLogger.info('Starting log analysis', {
      service: 'ai-log-analysis',
      source: 'analyzeRecentLogs',
      timeRange,
      analysisType
    });

    try {
      // Fetch recent logs with errors and patterns
      const logs = await this.fetchLogsForAnalysis(timeRange);
      
      if (logs.length === 0) {
        unifiedLogger.info('No logs to analyze', {
          service: 'ai-log-analysis',
          source: 'analyzeRecentLogs',
          timeRange
        });
        return { insights: [], patterns: [] };
      }

      // Perform different types of analysis
      const insights = [];

      switch (analysisType) {
        case 'anomaly':
          insights.push(...await this.detectAnomalies(logs));
          break;
        case 'pattern':
          insights.push(...await this.findPatterns(logs));
          break;
        case 'root_cause':
          insights.push(...await this.analyzeRootCauses(logs));
          break;
        case 'auto':
          // Run all analyses
          insights.push(...await this.detectAnomalies(logs));
          insights.push(...await this.findPatterns(logs));
          insights.push(...await this.analyzeRootCauses(logs));
          break;
      }

      // Store insights in database
      await this.storeInsights(insights, timeRange);

      const duration = Date.now() - startTime;
      unifiedLogger.info('Log analysis completed', {
        service: 'ai-log-analysis',
        source: 'analyzeRecentLogs',
        insightsFound: insights.length,
        durationMs: duration
      });

      return { insights, analysisTime: duration };

    } catch (error) {
      unifiedLogger.error('Log analysis failed', error, {
        service: 'ai-log-analysis',
        source: 'analyzeRecentLogs'
      });
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  async fetchLogsForAnalysis(timeRange) {
    const intervals = {
      '5m': '5 minutes',
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days'
    };

    const interval = intervals[timeRange] || '1 hour';

    const result = await pool.query(`
      SELECT 
        timestamp,
        level,
        service,
        source,
        message,
        error_type,
        error_message,
        metadata,
        duration_ms
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '${interval}'
      ORDER BY timestamp DESC
      LIMIT 1000
    `);

    return result.rows;
  }

  async detectAnomalies(logs) {
    unifiedLogger.debug('Detecting anomalies', {
      service: 'ai-log-analysis',
      source: 'detectAnomalies',
      logCount: logs.length
    });

    const insights = [];

    // Error spike detection
    const errorsByHour = {};
    const errorsByService = {};

    logs.forEach(log => {
      if (log.level === 'error') {
        const hour = new Date(log.timestamp).getHours();
        errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
        errorsByService[log.service] = (errorsByService[log.service] || 0) + 1;
      }
    });

    // Check for unusual error rates
    const avgErrors = Object.values(errorsByHour).reduce((a, b) => a + b, 0) / Object.keys(errorsByHour).length;
    Object.entries(errorsByHour).forEach(([hour, count]) => {
      if (count > avgErrors * 3) {
        insights.push({
          type: 'anomaly',
          severity: 'warning',
          title: 'Error Spike Detected',
          description: `Unusual number of errors (${count}) detected at hour ${hour} - ${(count / avgErrors * 100).toFixed(0)}% above average`,
          affected_services: Object.keys(errorsByService),
          confidence: 0.85,
          recommendations: {
            immediate: ['Check system resources', 'Review recent deployments'],
            preventive: ['Set up alerting for error spikes', 'Implement circuit breakers']
          }
        });
      }
    });

    // Performance anomalies
    const durationsMs = logs.filter(l => l.duration_ms).map(l => l.duration_ms);
    if (durationsMs.length > 0) {
      const avgDuration = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
      const p95Duration = this.calculatePercentile(durationsMs, 0.95);

      logs.forEach(log => {
        if (log.duration_ms && log.duration_ms > p95Duration * 2) {
          insights.push({
            type: 'anomaly',
            severity: 'warning',
            title: 'Performance Anomaly',
            description: `Request took ${log.duration_ms}ms - ${(log.duration_ms / avgDuration).toFixed(1)}x slower than average`,
            affected_services: [log.service],
            confidence: 0.75,
            metadata: {
              request: log.message,
              service: log.service,
              duration: log.duration_ms
            }
          });
        }
      });
    }

    // Repeated error patterns
    const errorPatterns = {};
    logs.filter(l => l.level === 'error').forEach(log => {
      const pattern = `${log.service}:${log.error_type || 'unknown'}`;
      if (!errorPatterns[pattern]) {
        errorPatterns[pattern] = { count: 0, examples: [] };
      }
      errorPatterns[pattern].count++;
      if (errorPatterns[pattern].examples.length < 3) {
        errorPatterns[pattern].examples.push(log);
      }
    });

    Object.entries(errorPatterns).forEach(([pattern, data]) => {
      if (data.count > 10) {
        insights.push({
          type: 'anomaly',
          severity: data.count > 50 ? 'critical' : 'warning',
          title: 'Repeated Error Pattern',
          description: `Error pattern "${pattern}" occurred ${data.count} times`,
          affected_services: [pattern.split(':')[0]],
          confidence: 0.90,
          metadata: {
            examples: data.examples.map(e => ({
              message: e.message,
              error: e.error_message,
              timestamp: e.timestamp
            }))
          }
        });
      }
    });

    return insights;
  }

  async findPatterns(logs) {
    unifiedLogger.debug('Finding patterns', {
      service: 'ai-log-analysis',
      source: 'findPatterns',
      logCount: logs.length
    });

    const insights = [];

    // Time-based patterns
    const logsByHour = {};
    logs.forEach(log => {
      const hour = new Date(log.timestamp).getHours();
      if (!logsByHour[hour]) {
        logsByHour[hour] = { total: 0, errors: 0 };
      }
      logsByHour[hour].total++;
      if (log.level === 'error') {
        logsByHour[hour].errors++;
      }
    });

    // Find peak hours
    const peakHours = Object.entries(logsByHour)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 3);

    if (peakHours.length > 0) {
      insights.push({
        type: 'pattern',
        severity: 'info',
        title: 'Peak Activity Hours',
        description: `Highest activity during hours: ${peakHours.map(([h]) => h).join(', ')}`,
        affected_services: ['all'],
        confidence: 0.95,
        recommendations: {
          preventive: ['Scale resources during peak hours', 'Implement caching strategies']
        }
      });
    }

    // Service interaction patterns
    const serviceInteractions = {};
    logs.forEach(log => {
      if (log.metadata?.source && log.metadata?.request?.service) {
        const interaction = `${log.service} -> ${log.metadata.request.service}`;
        serviceInteractions[interaction] = (serviceInteractions[interaction] || 0) + 1;
      }
    });

    const frequentInteractions = Object.entries(serviceInteractions)
      .filter(([, count]) => count > 20)
      .sort(([, a], [, b]) => b - a);

    if (frequentInteractions.length > 0) {
      insights.push({
        type: 'pattern',
        severity: 'info',
        title: 'Service Communication Patterns',
        description: 'Identified frequent service interactions',
        affected_services: [...new Set(frequentInteractions.flatMap(([i]) => i.split(' -> ')))],
        confidence: 0.80,
        metadata: {
          interactions: frequentInteractions.map(([interaction, count]) => ({
            pattern: interaction,
            count
          }))
        }
      });
    }

    return insights;
  }

  async analyzeRootCauses(logs) {
    unifiedLogger.debug('Analyzing root causes', {
      service: 'ai-log-analysis',
      source: 'analyzeRootCauses',
      logCount: logs.length
    });

    const insights = [];
    const errors = logs.filter(l => l.level === 'error');

    // Group errors by type and time
    const errorClusters = {};
    errors.forEach(error => {
      const key = error.error_type || 'unknown';
      if (!errorClusters[key]) {
        errorClusters[key] = [];
      }
      errorClusters[key].push(error);
    });

    // Analyze each cluster
    for (const [errorType, cluster] of Object.entries(errorClusters)) {
      if (cluster.length < 5) continue;

      // Check if errors started after a specific event
      const sortedErrors = cluster.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const firstError = sortedErrors[0];
      const lastError = sortedErrors[sortedErrors.length - 1];

      // Look for logs just before first error
      const beforeError = logs.filter(log => 
        new Date(log.timestamp) < new Date(firstError.timestamp) &&
        new Date(log.timestamp) > new Date(firstError.timestamp) - 60000 // 1 minute before
      );

      const possibleCauses = beforeError.filter(log => 
        log.level === 'warn' || log.message.includes('failed') || log.message.includes('error')
      );

      if (possibleCauses.length > 0) {
        insights.push({
          type: 'root_cause',
          severity: 'warning',
          title: `Possible Root Cause for ${errorType}`,
          description: `${cluster.length} errors of type "${errorType}" may be caused by earlier issues`,
          affected_services: [...new Set(cluster.map(e => e.service))],
          confidence: 0.70,
          metadata: {
            error_count: cluster.length,
            time_span: `${((new Date(lastError.timestamp) - new Date(firstError.timestamp)) / 60000).toFixed(1)} minutes`,
            possible_causes: possibleCauses.slice(0, 3).map(c => ({
              message: c.message,
              service: c.service,
              timestamp: c.timestamp
            }))
          },
          recommendations: {
            immediate: ['Review logs before first error', 'Check service dependencies'],
            preventive: ['Add better error handling', 'Implement dependency health checks']
          }
        });
      }
    }

    // Database connection issues
    const dbErrors = errors.filter(e => 
      e.error_message?.includes('ECONNREFUSED') || 
      e.error_message?.includes('connection') ||
      e.service === 'database'
    );

    if (dbErrors.length > 5) {
      insights.push({
        type: 'root_cause',
        severity: 'critical',
        title: 'Database Connectivity Issues',
        description: `${dbErrors.length} database-related errors detected`,
        affected_services: ['database', ...new Set(dbErrors.map(e => e.service))],
        confidence: 0.85,
        recommendations: {
          immediate: ['Check database server status', 'Review connection pool settings'],
          preventive: ['Implement connection retry logic', 'Add database monitoring']
        }
      });
    }

    return insights;
  }

  async storeInsights(insights, timeRange) {
    const startTime = Date.now();
    
    for (const insight of insights) {
      try {
        await pool.query(`
          INSERT INTO log_ai_analysis (
            period_start,
            period_end,
            analysis_type,
            severity,
            title,
            description,
            affected_services,
            recommendations,
            confidence_score,
            metadata
          ) VALUES (
            NOW() - INTERVAL '${timeRange}',
            NOW(),
            $1, $2, $3, $4, $5, $6, $7, $8
          )
        `, [
          insight.type,
          insight.severity,
          insight.title,
          insight.description,
          insight.affected_services,
          JSON.stringify(insight.recommendations || {}),
          insight.confidence || 0.5,
          JSON.stringify(insight.metadata || {})
        ]);
      } catch (error) {
        unifiedLogger.error('Failed to store insight', error, {
          service: 'ai-log-analysis',
          source: 'storeInsights',
          insight: insight.title
        });
      }
    }

    const duration = Date.now() - startTime;
    unifiedLogger.debug('Insights stored', {
      service: 'ai-log-analysis',
      source: 'storeInsights',
      count: insights.length,
      durationMs: duration
    });
  }

  calculatePercentile(values, percentile) {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index];
  }

  async stop() {
    unifiedLogger.info('Stopping AI log analysis service', {
      service: 'ai-log-analysis',
      source: 'stop'
    });
  }
}

// Create singleton instance
const aiLogAnalysisService = new AILogAnalysisService();

export default aiLogAnalysisService;