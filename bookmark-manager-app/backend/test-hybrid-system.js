import unifiedLogger from './src/services/unifiedLogger.js';
import agentInitializationService from './src/services/agentInitializationService.js';
import a2aTaskManager from './src/services/a2aTaskManager.js';
import agentExecutor from './src/services/agentExecutor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testHybridSystem() {
  console.log('\n=== Testing A2A-Redis Hybrid System ===\n');
  
  try {
    // Step 1: Initialize agents
    console.log('1. Initializing agents with hybrid execution...');
    await agentInitializationService.initialize();
    console.log('✓ Agents initialized\n');
    
    // Step 2: Check agent registration
    console.log('2. Checking agent registration...');
    const agents = await a2aTaskManager.getRegisteredAgents();
    console.log(`✓ ${agents.length} agents registered:`);
    agents.forEach(agent => {
      console.log(`   - ${agent.agentType} (concurrency: ${agent.concurrency || 'default'})`);
    });
    console.log('');
    
    // Step 3: Check queue stats
    console.log('3. Checking queue statistics...');
    const queueStats = await agentExecutor.getAllQueueStats();
    console.log('Queue stats:', JSON.stringify(queueStats, null, 2));
    console.log('');
    
    // Step 4: Create a test bookmark file
    console.log('4. Creating test bookmark file...');
    const testBookmarks = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://www.az1.ai" ADD_DATE="1609459200">AZ1 AI Platform</A>
    <DT><A HREF="https://sloanreview.mit.edu/article/building-ai-capabilities-into-portfolio-companies-at-apollo/" ADD_DATE="1609459200">Building AI Capabilities</A>
    <DT><A HREF="https://sloanreview.mit.edu/big-ideas/artificial-intelligence-business-strategy/" ADD_DATE="1609459200">AI Business Strategy</A>
</DL><p>`;
    
    const testFilePath = path.join(__dirname, 'test-bookmarks-hybrid.html');
    await fs.writeFile(testFilePath, testBookmarks);
    console.log('✓ Test file created\n');
    
    // Step 5: Create import task
    console.log('5. Creating import task via A2A Task Manager...');
    const testUserId = uuidv4();
    const task = await a2aTaskManager.createTask('full_import', {
      userId: testUserId,
      filePath: testFilePath,
      fileName: 'test-bookmarks-hybrid.html'
    });
    console.log(`✓ Task created: ${task.id}`);
    console.log(`   Workflow: ${task.workflow.type}`);
    console.log(`   Agents: ${task.workflow.agents.join(' -> ')}\n`);
    
    // Step 6: Monitor task progress
    console.log('6. Monitoring task progress...');
    let lastStep = -1;
    const checkProgress = async () => {
      const currentTask = await a2aTaskManager.getTask(task.id);
      if (!currentTask) {
        console.log('Task completed or not found.');
        return false;
      }
      
      if (currentTask.workflow.currentStep !== lastStep) {
        lastStep = currentTask.workflow.currentStep;
        console.log(`   Step ${currentTask.workflow.currentStep + 1}/${currentTask.workflow.totalSteps}: ${currentTask.workflow.currentAgent || 'completed'}`);
      }
      
      if (currentTask.status === 'completed' || currentTask.status === 'failed') {
        console.log(`   Final status: ${currentTask.status}`);
        return false;
      }
      
      return true;
    };
    
    // Poll for progress
    while (await checkProgress()) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n7. Checking final queue stats...');
    const finalStats = await agentExecutor.getAllQueueStats();
    console.log('Final queue stats:', JSON.stringify(finalStats, null, 2));
    
    // Cleanup
    await fs.unlink(testFilePath).catch(() => {});
    
    console.log('\n✓ Hybrid system test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\nShutting down...');
    await agentInitializationService.shutdown();
    process.exit(0);
  }
}

// Run the test
testHybridSystem();