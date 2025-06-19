#!/usr/bin/env python3
import argon2
import psycopg2
from psycopg2.extras import DictCursor

# Argon2 configuration to match Rust's argon2 defaults
ph = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    hash_len=32,
    salt_len=16
)

def reset_admin_password():
    # Database connection
    conn = psycopg2.connect(
        host="localhost",
        port=5434,
        user="admin",
        password="admin",
        database="bookmark_manager"
    )
    
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # Generate Argon2 hash for the password
            password = "changeme123"
            password_hash = ph.hash(password)
            
            # Update the admin user's password
            cur.execute("""
                UPDATE users 
                SET password_hash = %s, updated_at = NOW() 
                WHERE email = 'admin@az1.ai'
                RETURNING id, email, role
            """, (password_hash,))
            
            result = cur.fetchone()
            
            if result is None:
                print("Admin user not found. Creating admin user...")
                
                # Create admin user if it doesn't exist
                cur.execute("""
                    INSERT INTO users (email, password_hash, role, two_factor_enabled, created_at, updated_at)
                    VALUES ('admin@az1.ai', %s, 'admin', false, NOW(), NOW())
                    RETURNING id, email, role
                """, (password_hash,))
                
                result = cur.fetchone()
                print(f"Admin user created: {dict(result)}")
            else:
                print(f"Admin password reset successfully: {dict(result)}")
                print(f"New password hash: {password_hash}")
            
            conn.commit()
            
    except Exception as e:
        print(f"Error resetting admin password: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    reset_admin_password()