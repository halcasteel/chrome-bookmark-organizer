const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function resetAdminPassword() {
  const client = new Client({
    host: 'localhost',
    port: 5434,
    user: 'admin',
    password: 'admin',
    database: 'bookmark_manager'
  });

  try {
    await client.connect();
    
    // Generate a bcrypt hash for the password
    const password = 'changeme123';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    // Update the admin user's password
    const query = `
      UPDATE users 
      SET password_hash = $1, updated_at = NOW() 
      WHERE email = 'admin@az1.ai'
      RETURNING id, email, role
    `;
    
    const result = await client.query(query, [hash]);
    
    if (result.rowCount === 0) {
      console.log('Admin user not found. Creating admin user...');
      
      // Create admin user if it doesn't exist
      const insertQuery = `
        INSERT INTO users (email, password_hash, role, two_factor_enabled, created_at, updated_at)
        VALUES ('admin@az1.ai', $1, 'admin', false, NOW(), NOW())
        RETURNING id, email, role
      `;
      
      const insertResult = await client.query(insertQuery, [hash]);
      console.log('Admin user created:', insertResult.rows[0]);
    } else {
      console.log('Admin password reset successfully:', result.rows[0]);
    }
    
  } catch (error) {
    console.error('Error resetting admin password:', error);
  } finally {
    await client.end();
  }
}

resetAdminPassword();