import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Testing database connection...');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    
    await client.connect();
    console.log('✅ Connected to database!');

    // Test pgvector
    const vectorTest = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (vectorTest.rows.length > 0) {
      console.log('✅ pgvector is installed:', vectorTest.rows[0].extversion);
    }

    // Test users table with @az1.ai constraint
    console.log('\nTesting @az1.ai email constraint...');
    try {
      await client.query("INSERT INTO users (email, password_hash, name) VALUES ('test@gmail.com', 'test', 'Test User')");
      console.log('❌ FAILED: Non-@az1.ai email was accepted!');
    } catch (error) {
      console.log('✅ Good! Non-@az1.ai email was rejected:', error.message);
    }

    // Count tables
    const tables = await client.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    console.log(`\n✅ Found ${tables.rows[0].count} tables in the database`);

    console.log('\n🎉 Database is ready for use!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();