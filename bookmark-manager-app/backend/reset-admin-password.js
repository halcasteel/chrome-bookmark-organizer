import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

async function resetAdminPassword() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5434/bookmark_manager'
  });

  try {
    const email = 'admin@az1.ai';
    const newPassword = 'changeme123';
    
    console.log(`Resetting password for ${email}...`);
    
    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update the user's password
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, name',
      [passwordHash, email]
    );
    
    if (result.rows.length === 0) {
      console.error(`User ${email} not found!`);
      
      // Check if any users exist
      const userCheck = await pool.query('SELECT email FROM users');
      if (userCheck.rows.length === 0) {
        console.log('No users found in database. Creating admin user...');
        
        // Create the admin user
        const createResult = await pool.query(
          `INSERT INTO users (email, password_hash, name, role, two_factor_enabled, two_factor_verified) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING id, email, name`,
          [email, passwordHash, 'Admin User', 'admin', false, false]
        );
        
        console.log('Admin user created successfully!');
        console.log('User:', createResult.rows[0]);
      } else {
        console.log('Existing users:', userCheck.rows.map(u => u.email).join(', '));
      }
    } else {
      console.log('Password reset successful!');
      console.log('User:', result.rows[0]);
    }
    
    console.log(`\nYou can now login with:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);
    
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await pool.end();
  }
}

resetAdminPassword();