const { Pool } = require("pg");

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "workshop_db",
  password: process.env.DB_PASSWORD || "admin123",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl:
    process.env.DB_HOST && process.env.DB_HOST !== "localhost"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

async function createTodosTable() {
  const client = await pool.connect();

  try {
    console.log("Creating todos table...");

    // Create todos table
    await client.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
        status VARCHAR(20) CHECK (status IN ('pending', 'in-progress', 'completed')) DEFAULT 'pending',
        due_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Creating indexes for todos table...");

    // Create indexes for better performance
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status);"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_todos_user_priority ON todos(user_id, priority);"
    );

    console.log("Todos table and indexes created successfully!");

    // Insert sample data if table is empty
    const countResult = await client.query("SELECT COUNT(*) FROM todos");
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log("Inserting sample todo data...");

      // Get a sample user to associate todos with
      const userResult = await client.query("SELECT id FROM users LIMIT 1");
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;

        await client.query(
          `
          INSERT INTO todos (user_id, title, description, priority, status, due_date) 
          VALUES 
            ($1, 'Complete workshop project', 'Finish implementing the todo list feature with all CRUD operations', 'high', 'in-progress', '2024-12-31'),
            ($1, 'Review code', 'Code review for team members and provide feedback', 'medium', 'pending', '2024-12-25'),
            ($1, 'Update documentation', 'Update API documentation and user guides', 'low', 'completed', '2024-12-20'),
            ($1, 'Setup development environment', 'Install and configure all necessary development tools', 'high', 'completed', '2024-12-15'),
            ($1, 'Write unit tests', 'Create comprehensive unit tests for all components', 'medium', 'pending', '2024-12-30');
        `,
          [userId]
        );

        console.log("Sample todo data inserted successfully!");
      }
    }
  } catch (error) {
    console.error("Error creating todos table:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTodosTable()
  .then(() => {
    console.log("Database migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Database migration failed:", error);
    process.exit(1);
  });
