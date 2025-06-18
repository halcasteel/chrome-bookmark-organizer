import pg from 'pg';

const db = new pg.Client({
  host: 'localhost',
  port: 5434,
  database: 'bookmark_manager',
  user: 'admin',
  password: 'admin'
});

try {
  await db.connect();
  console.log('✓ Connected to database\n');
  
  // Check registered agents
  const agentsResult = await db.query(
    `SELECT agent_type, status, version 
     FROM a2a_agent_capabilities 
     WHERE status = 'active' 
     ORDER BY agent_type`
  );
  
  console.log('Registered A2A Agents:');
  if (agentsResult.rows.length === 0) {
    console.log('  ❌ No agents registered!');
  } else {
    agentsResult.rows.forEach(r => {
      console.log(`  ✓ ${r.agent_type} (v${r.version})`);
    });
  }
  
  // Check recent tasks
  const tasksResult = await db.query(
    `SELECT id, type, status, current_agent, created 
     FROM a2a_tasks 
     ORDER BY created DESC 
     LIMIT 5`
  );
  
  console.log('\nRecent A2A Tasks:');
  if (tasksResult.rows.length === 0) {
    console.log('  No tasks found');
  } else {
    tasksResult.rows.forEach(r => {
      console.log(`  - ${r.id}: ${r.type} (${r.status}) - ${r.current_agent || 'pending'}`);
    });
  }
  
  // Check if embedding agent exists
  const embeddingCheck = await db.query(
    `SELECT COUNT(*) as count 
     FROM a2a_agent_capabilities 
     WHERE agent_type = 'embedding' AND status = 'active'`
  );
  
  if (embeddingCheck.rows[0].count > 0) {
    console.log('\n✓ Embedding agent is registered');
  } else {
    console.log('\n❌ Embedding agent is NOT registered');
  }
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await db.end();
}