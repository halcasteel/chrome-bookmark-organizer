import db from '../src/db/index.js';

// Check if import_history table exists
async function checkImportHistoryTable() {
  try {
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'import_history'
      );
    `);
    
    console.log('import_history table exists:', result.rows[0].exists);
    
    if (result.rows[0].exists) {
      // Check columns
      const columns = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'import_history' 
        ORDER BY ordinal_position
      `);
      
      console.log('\nimport_history columns:');
      columns.rows.forEach(row => {
        console.log(`- ${row.column_name}: ${row.data_type}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkImportHistoryTable();