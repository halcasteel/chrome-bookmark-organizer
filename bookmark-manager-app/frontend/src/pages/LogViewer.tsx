import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import logger from '../services/logger';

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  service: string;
  source: string;
  message: string;
  metadata?: any;
  requestId?: string;
  userId?: string;
}

interface LogStats {
  files: Record<string, { size: string; modified: string; lines: number }>;
  services: Record<string, number>;
  levels: Record<string, number>;
  recentErrors: LogEntry[];
}

export default function LogViewer() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [filters, setFilters] = useState({
    level: 'all',
    service: 'all',
    search: '',
    lines: 100
  });
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Check if user is admin
  if (!user?.isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent>
            <p className="text-red-600">Access denied. Admin privileges required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    fetchLogs();
    fetchStats();
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        lines: filters.lines.toString(),
        level: filters.level,
        service: filters.service,
        search: filters.search
      });
      
      const response = await api.get(`/logs/recent?${params}`);
      setLogs(response.data.logs);
      logger.info('Logs fetched', { count: response.data.logs.length });
    } catch (error) {
      logger.error('Failed to fetch logs', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/logs/stats');
      setStats(response.data);
    } catch (error) {
      logger.error('Failed to fetch log stats', error);
    }
  };

  const toggleStreaming = () => {
    if (streaming) {
      // Stop streaming
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setStreaming(false);
    } else {
      // Start streaming
      const token = localStorage.getItem('token');
      eventSourceRef.current = new EventSource(
        `/api/logs/stream?token=${token}`
      );
      
      eventSourceRef.current.onmessage = (event) => {
        const log = JSON.parse(event.data);
        setLogs(prev => [...prev.slice(-99), log]);
        scrollToBottom();
      };
      
      eventSourceRef.current.onerror = () => {
        logger.error('Log stream connection lost');
        setStreaming(false);
      };
      
      setStreaming(true);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const downloadLog = async (filename: string) => {
    try {
      const response = await api.get(`/logs/download/${filename}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      logger.info('Log file downloaded', { filename });
    } catch (error) {
      logger.error('Failed to download log', error);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-100';
      case 'warn': return 'text-yellow-600 bg-yellow-100';
      case 'info': return 'text-blue-600 bg-blue-100';
      case 'debug': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'backend': return 'text-green-600 bg-green-100';
      case 'frontend': return 'text-purple-600 bg-purple-100';
      case 'database': return 'text-indigo-600 bg-indigo-100';
      case 'worker': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">System Logs</h1>
        <p className="text-gray-600">Real-time unified logging across all services</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-gray-500">Total Logs</h3>
              <p className="text-2xl font-bold">
                {Object.values(stats.levels).reduce((a, b) => a + b, 0)}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-gray-500">Errors (24h)</h3>
              <p className="text-2xl font-bold text-red-600">
                {stats.levels.error || 0}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-gray-500">Active Services</h3>
              <p className="text-2xl font-bold">
                {Object.keys(stats.services).length}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-medium text-gray-500">Log Size</h3>
              <p className="text-2xl font-bold">
                {stats.files['unified.log']?.size || '0MB'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <Select
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                className="w-32"
              >
                <option value="all">All</option>
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Service</label>
              <Select
                value={filters.service}
                onChange={(e) => setFilters({ ...filters, service: e.target.value })}
                className="w-32"
              >
                <option value="all">All</option>
                {stats && Object.keys(stats.services).map(service => (
                  <option key={service} value={service}>{service}</option>
                ))}
              </Select>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Search</label>
              <Input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search logs..."
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Lines</label>
              <Select
                value={filters.lines}
                onChange={(e) => setFilters({ ...filters, lines: parseInt(e.target.value) })}
                className="w-24"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </Select>
            </div>
            
            <Button
              onClick={toggleStreaming}
              variant={streaming ? 'destructive' : 'primary'}
            >
              {streaming ? 'Stop Streaming' : 'Start Streaming'}
            </Button>
            
            <Button onClick={fetchLogs} variant="outline">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log Viewer */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">
              Log Entries {streaming && <Badge variant="success">Live</Badge>}
            </h2>
            <div className="space-x-2">
              {stats && Object.keys(stats.files).map(filename => (
                <Button
                  key={filename}
                  size="sm"
                  variant="outline"
                  onClick={() => downloadLog(filename)}
                >
                  Download {filename}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg h-[600px] overflow-auto font-mono text-sm">
            {loading ? (
              <div className="text-center py-8">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8">No logs found</div>
            ) : (
              <>
                {logs.map((log, index) => (
                  <div key={index} className="mb-2 flex items-start hover:bg-gray-800 p-1 rounded">
                    <span className="text-gray-500 mr-2 min-w-[180px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <Badge className={`mr-2 min-w-[60px] text-center ${getLevelColor(log.level)}`}>
                      {log.level}
                    </Badge>
                    <Badge className={`mr-2 ${getServiceColor(log.service)}`}>
                      {log.service}
                    </Badge>
                    <span className="text-gray-400 mr-2">[{log.source}]</span>
                    <span className="flex-1">
                      {log.message}
                      {log.metadata && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-gray-400">
                            View details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}