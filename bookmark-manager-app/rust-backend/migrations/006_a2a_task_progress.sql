-- Migration: Add A2A task progress tracking for hybrid execution
-- This table tracks individual agent execution status within tasks

CREATE TABLE IF NOT EXISTS a2a_task_progress (
  task_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started TIMESTAMP,
  completed TIMESTAMP,
  error_message TEXT,
  attempts INT DEFAULT 0,
  job_id VARCHAR(255),
  progress_data JSONB DEFAULT '{}',
  created TIMESTAMP DEFAULT NOW(),
  updated TIMESTAMP DEFAULT NOW(),
  
  PRIMARY KEY (task_id, agent_type),
  FOREIGN KEY (task_id) REFERENCES a2a_tasks(id) ON DELETE CASCADE
);

-- Index for querying task progress
CREATE INDEX idx_a2a_task_progress_task_id ON a2a_task_progress(task_id);
CREATE INDEX idx_a2a_task_progress_status ON a2a_task_progress(status);
CREATE INDEX idx_a2a_task_progress_updated ON a2a_task_progress(updated DESC);

-- Add job tracking columns to a2a_tasks if not exists
ALTER TABLE a2a_tasks 
  ADD COLUMN IF NOT EXISTS current_job_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_job_queue VARCHAR(255);