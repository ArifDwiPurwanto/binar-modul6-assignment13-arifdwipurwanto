const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "workshop_db",
  password: process.env.DB_PASSWORD || "admin123",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl:
    process.env.DB_HOST && process.env.DB_HOST !== "localhost"
      ? { rejectUnauthorized: false }
      : false,
});

async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

async function updateSchema() {
  console.log("🔄 Updating database schema for profile update feature...");

  try {
    // Add profile_picture_url column to users table if it doesn't exist
    await executeQuery(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'users' AND column_name = 'profile_picture_url') THEN
          ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(500);
        END IF;
      END $$;
    `);

    // Drop existing user_profile_updates table if it exists and recreate with correct structure
    await executeQuery(`DROP TABLE IF EXISTS user_profile_updates CASCADE;`);

    // Create user_profile_updates table with correct structure
    await executeQuery(`
      CREATE TABLE user_profile_updates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        updated_fields JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for user_profile_updates
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_user_profile_updates_user_id ON user_profile_updates(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_profile_updates_created_at ON user_profile_updates(created_at);
    `);

    // Create trigger function for updated_at
    await executeQuery(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for users and todos tables
    await executeQuery(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await executeQuery(`
      DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
      CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    // Add additional indexes for todos table
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_todos_user_status_priority ON todos(user_id, status, priority);
      CREATE INDEX IF NOT EXISTS idx_todos_user_due_date_status ON todos(user_id, due_date, status);
      CREATE INDEX IF NOT EXISTS idx_todos_search ON todos(user_id, title, description);
    `);

    // Add indexes for user_logs
    await executeQuery(`
      CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at);
    `);

    console.log("🎉 Database schema update completed successfully!");
  } catch (error) {
    console.error("❌ Error updating database schema:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateSchema()
  .then(() => {
    console.log("✅ Schema update completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Schema update failed:", error);
    process.exit(1);
  });
