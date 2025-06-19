# Orchestrator Service Dependencies Analysis

## Summary
The orchestratorService is deeply integrated into the application and cannot be safely removed without migration. Here are all the dependencies found:

## Backend Dependencies

### 1. Worker Service (`backend/src/workers/index.js`)
- Imports orchestratorService
- Uses `orchestratorService.performHealthCheck()` in periodic health checks (every 60 seconds)
- Health check logs orchestrator status

### 2. Orchestrator Routes (`backend/src/routes/orchestrator.js`)
- Fully depends on orchestratorService for all functionality:
  - `GET /orchestrator/dashboard` - calls `orchestratorService.getDashboardData()`
  - `GET /orchestrator/health` - calls `orchestratorService.performHealthCheck()`
  - `POST /orchestrator/workflow` - calls `orchestratorService.startWorkflow()`
  - `GET /orchestrator/workflow/:workflowId` - accesses `orchestratorService.activeWorkflows`
  - `POST /orchestrator/agent/:agentType/pause` - calls `orchestratorService.pauseAgent()`
  - `POST /orchestrator/agent/:agentType/resume` - calls `orchestratorService.resumeAgent()`
  - `POST /orchestrator/cleanup` - calls `orchestratorService.cleanup()`

### 3. Import Service Async (`backend/src/services/importServiceAsync.js`)
- Uses orchestratorService after bulk importing bookmarks
- Calls `orchestratorService.startWorkflow()` to process imported bookmarks
- Creates workflows with type 'standard' for validation/enrichment pipeline

### 4. Main Backend (`backend/src/index.js`)
- Registers orchestrator routes at `/api/orchestrator`

### 5. WebSocket Service (`backend/src/services/websocketService.js`)
- Has dedicated orchestrator methods:
  - `emitWorkflowUpdate()` - emits workflow status updates
  - `emitWorkflowProgress()` - emits workflow progress
  - `emitOrchestratorHealth()` - emits orchestrator health status
- Clients can subscribe to `orchestrator:health` room

## Frontend Dependencies

### 1. Dashboard Component (`frontend/src/pages/Dashboard.tsx`)
- Queries orchestrator data: `GET /api/orchestrator/dashboard`
- Displays orchestrator information:
  - Active workflows with progress
  - Agent statuses and health
  - System health metrics
- Admin-only features:
  - Pause/resume agents functionality
  - WebSocket subscription to `orchestrator:health`
- Uses orchestratorData for:
  - Active workflow count
  - Agent count and status
  - Workflow progress tracking

## Data Flow
1. **Import Flow**: File Upload → Import Service → Orchestrator → Agents
2. **Dashboard Flow**: Frontend → API → Orchestrator → Agent Queues
3. **Health Monitoring**: Workers → Orchestrator Health Check → WebSocket → Dashboard

## Migration Requirements
To safely remove orchestratorService, we need to:

1. **Replace Workflow Management**
   - Migrate `startWorkflow()` to A2A Task Manager
   - Update import service to use A2A tasks instead

2. **Replace Health Monitoring**
   - Create new health check system for A2A agents
   - Update worker health checks
   - Update dashboard to use new health endpoint

3. **Replace Dashboard Data**
   - Create new dashboard endpoint using A2A data
   - Update frontend queries and components
   - Migrate WebSocket events

4. **Replace Agent Control**
   - Implement pause/resume in A2A system
   - Update admin controls

5. **Update Routes**
   - Remove `/api/orchestrator` routes
   - Add equivalent A2A routes
   - Update frontend API calls

## Recommendation
The orchestrator is too deeply integrated to remove without a proper migration. We should:
1. First complete A2A agent registration and integration
2. Create parallel A2A endpoints alongside orchestrator
3. Gradually migrate features one by one
4. Only remove orchestrator after full migration and testing