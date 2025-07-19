import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { executeQuery } from "../src/lib/database";

describe("Todo API Tests", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Create a test auth record first
    const authResult = await executeQuery(`
      INSERT INTO auth (email, password)
      VALUES ('test@example.com', 'hashedpassword')
      RETURNING id
    `);
    const authId = authResult.rows[0].id;

    // Create a test user for todo operations
    const userResult = await executeQuery(
      `
      INSERT INTO users (auth_id, full_name, username, birth_date, bio, long_bio, profile_json, address, phone_number)
      VALUES ($1, 'Test User', 'testuser', '1990-01-01', 'Test bio', 'Test long bio', '{}', 'Test Address', '+1234567890')
      RETURNING id
    `,
      [authId]
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await executeQuery("DELETE FROM todos WHERE user_id = $1", [testUserId]);
    await executeQuery("DELETE FROM users WHERE id = $1", [testUserId]);

    // Clean up auth record
    const userResult = await executeQuery(
      "SELECT auth_id FROM users WHERE id = $1",
      [testUserId]
    );
    if (userResult.rows.length > 0) {
      await executeQuery("DELETE FROM auth WHERE id = $1", [
        userResult.rows[0].auth_id,
      ]);
    }
  });

  describe("Database Schema", () => {
    it("should have todos table with correct structure", async () => {
      const result = await executeQuery(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'todos'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
        default: row.column_default,
      }));

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "id",
          type: "integer",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "user_id",
          type: "integer",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "title",
          type: "character varying",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "priority",
          type: "character varying",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "status",
          type: "character varying",
        })
      );
    });

    it("should have required indexes", async () => {
      const result = await executeQuery(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'todos'
      `);

      const indexes = result.rows.map((row) => row.indexname);

      expect(indexes).toContain("idx_todos_user_id");
      expect(indexes).toContain("idx_todos_status");
      expect(indexes).toContain("idx_todos_priority");
      expect(indexes).toContain("idx_todos_due_date");
    });
  });

  describe("Todo CRUD Operations", () => {
    it("should create a todo", async () => {
      const todoData = {
        title: "Test Todo",
        description: "Test Description",
        priority: "high",
        status: "pending",
        dueDate: "2024-12-31",
      };

      const result = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status, due_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, description, priority, status, due_date
      `,
        [
          testUserId,
          todoData.title,
          todoData.description,
          todoData.priority,
          todoData.status,
          todoData.dueDate,
        ]
      );

      expect(result.rows[0]).toMatchObject({
        title: todoData.title,
        description: todoData.description,
        priority: todoData.priority,
        status: todoData.status,
      });
    });

    it("should read todos for a user", async () => {
      const result = await executeQuery(
        `
        SELECT id, title, description, priority, status, due_date
        FROM todos
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
        [testUserId]
      );

      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it("should update a todo", async () => {
      // First create a todo
      const createResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
        [
          testUserId,
          "Update Test Todo",
          "Original Description",
          "low",
          "pending",
        ]
      );

      const todoId = createResult.rows[0].id;

      // Update the todo
      const updateResult = await executeQuery(
        `
        UPDATE todos
        SET title = $1, description = $2, priority = $3, status = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND user_id = $6
        RETURNING id, title, description, priority, status
      `,
        [
          "Updated Todo Title",
          "Updated Description",
          "high",
          "completed",
          todoId,
          testUserId,
        ]
      );

      expect(updateResult.rows[0]).toMatchObject({
        title: "Updated Todo Title",
        description: "Updated Description",
        priority: "high",
        status: "completed",
      });
    });

    it("should delete a todo", async () => {
      // First create a todo
      const createResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
        [testUserId, "Delete Test Todo", "To be deleted", "medium", "pending"]
      );

      const todoId = createResult.rows[0].id;

      // Delete the todo
      await executeQuery(
        `
        DELETE FROM todos
        WHERE id = $1 AND user_id = $2
      `,
        [todoId, testUserId]
      );

      // Verify it's deleted
      const checkResult = await executeQuery(
        `
        SELECT id FROM todos WHERE id = $1
      `,
        [todoId]
      );

      expect(checkResult.rows.length).toBe(0);
    });
  });

  describe("Todo Statistics", () => {
    beforeEach(async () => {
      // Create test todos for statistics
      await executeQuery(
        `
        INSERT INTO todos (user_id, title, priority, status) VALUES
        ($1, 'High Priority Todo', 'high', 'pending'),
        ($1, 'Medium Priority Todo', 'medium', 'in-progress'),
        ($1, 'Low Priority Todo', 'low', 'completed'),
        ($1, 'Another High Todo', 'high', 'completed')
      `,
        [testUserId]
      );
    });

    afterEach(async () => {
      // Clean up test todos
      await executeQuery(
        "DELETE FROM todos WHERE user_id = $1 AND title LIKE '%Priority%'",
        [testUserId]
      );
    });

    it("should calculate correct statistics", async () => {
      const result = await executeQuery(
        `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
          COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_priority,
          COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_priority
        FROM todos
        WHERE user_id = $1
      `,
        [testUserId]
      );

      const stats = result.rows[0];

      expect(parseInt(stats.total)).toBe(4);
      expect(parseInt(stats.pending)).toBe(1);
      expect(parseInt(stats.in_progress)).toBe(1);
      expect(parseInt(stats.completed)).toBe(2);
      expect(parseInt(stats.high_priority)).toBe(2);
      expect(parseInt(stats.medium_priority)).toBe(1);
      expect(parseInt(stats.low_priority)).toBe(1);
    });
  });

  describe("Todo Constraints", () => {
    it("should enforce priority constraints", async () => {
      await expect(
        executeQuery(
          `
        INSERT INTO todos (user_id, title, priority)
        VALUES ($1, $2, $3)
      `,
          [testUserId, "Invalid Priority Todo", "invalid"]
        )
      ).rejects.toThrow();
    });

    it("should enforce status constraints", async () => {
      await expect(
        executeQuery(
          `
        INSERT INTO todos (user_id, title, status)
        VALUES ($1, $2, $3)
      `,
          [testUserId, "Invalid Status Todo", "invalid"]
        )
      ).rejects.toThrow();
    });

    it("should require title", async () => {
      await expect(
        executeQuery(
          `
        INSERT INTO todos (user_id, title)
        VALUES ($1, $2)
      `,
          [testUserId, null]
        )
      ).rejects.toThrow();
    });
  });
});
