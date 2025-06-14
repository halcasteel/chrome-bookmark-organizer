import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const { Client } = pg;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function createAdminUser() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5434/bookmark_manager',
  });

  try {
    console.log('🔧 Creating Admin User for Bookmark Manager');
    console.log('=========================================');
    
    // Get user details
    const email = await question('Email (@az1.ai): ');
    
    // Validate email
    if (!email.endsWith('@az1.ai')) {
      console.error('❌ Error: Only @az1.ai email addresses are allowed!');
      process.exit(1);
    }
    
    const name = await question('Name: ');
    const password = await question('Password (min 8 chars): ');
    
    if (password.length < 8) {
      console.error('❌ Error: Password must be at least 8 characters!');
      process.exit(1);
    }

    console.log('\nConnecting to database...');
    await client.connect();

    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.error('❌ Error: User with this email already exists!');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create user (2FA will be set up on first login)
    const result = await client.query(
      `INSERT INTO users (id, email, password_hash, name, two_factor_enabled, created_at) 
       VALUES ($1, $2, $3, $4, false, CURRENT_TIMESTAMP) 
       RETURNING id, email, name`,
      [userId, email, passwordHash, name]
    );

    console.log('\n✅ Admin user created successfully!');
    console.log('User ID:', result.rows[0].id);
    console.log('Email:', result.rows[0].email);
    console.log('Name:', result.rows[0].name);
    console.log('\n⚠️  IMPORTANT: You must set up 2FA on your first login!');
    
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    rl.close();
  }
}

// Run the script
createAdminUser();