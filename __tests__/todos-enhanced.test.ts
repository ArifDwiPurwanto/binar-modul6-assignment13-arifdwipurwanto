import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import { executeQuery } from "../src/lib/database";

describe("Enhanced Todo API Tests", () => {
  let testUserId: number;
  let testAuthId: number;

  beforeAll(async () => {
    // Create a test auth record
    const authResult = await executeQuery(`
      INSERT INTO auth (email, password)
      VALUES ('todo-test@example.com', 'hashedpassword')
      RETURNING id
    `);
    testAuthId = authResult.rows[0].id;

    // Create a test user
    const userResult = await executeQuery(
      `
      INSERT INTO users (auth_id, full_name, username)
      VALUES ($1, 'Todo Test User', 'todotestuser')
      RETURNING id
    `,
      [testAuthId]
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await executeQuery("DELETE FROM todos WHERE user_id = $1", [testUserId]);
    await executeQuery("DELETE FROM user_logs WHERE user_id = $1", [
      testUserId,
    ]);
    await executeQuery("DELETE FROM users WHERE id = $1", [testUserId]);
    await executeQuery("DELETE FROM auth WHERE id = $1", [testAuthId]);
  });

  beforeEach(async () => {
    // Clear todos and logs before each test
    await executeQuery("DELETE FROM todos WHERE user_id = $1", [testUserId]);
    await executeQuery("DELETE FROM user_logs WHERE user_id = $1", [
      testUserId,
    ]);
  });

  describe("Todo CRUD Operations", () => {
    it("should create a todo with all fields", async () => {
      const todoData = {
        title: "Complete Workshop Project",
        description:
          "Finish implementing the comprehensive todo list feature with all requirements",
        priority: "high",
        status: "in-progress",
        dueDate: "2024-12-31",
      };

      const result = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status, due_date)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, title, description, priority, status, due_date, created_at, updated_at
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

      const todo = result.rows[0];
      expect(todo).toMatchObject({
        user_id: testUserId,
        title: todoData.title,
        description: todoData.description,
        priority: todoData.priority,
        status: todoData.status,
        due_date: todoData.dueDate,
      });
      expect(todo.created_at).toBeDefined();
      expect(todo.updated_at).toBeDefined();
    });

    it("should read todos with pagination and filters", async () => {
      // Create test todos
      const todos = [
        { title: "High Priority Task", priority: "high", status: "pending" },
        {
          title: "Medium Priority Task",
          priority: "medium",
          status: "in-progress",
        },
        { title: "Low Priority Task", priority: "low", status: "completed" },
        { title: "Another High Task", priority: "high", status: "completed" },
      ];

      for (const todo of todos) {
        await executeQuery(
          `
          INSERT INTO todos (user_id, title, priority, status)
          VALUES ($1, $2, $3, $4)
        `,
          [testUserId, todo.title, todo.priority, todo.status]
        );
      }

      // Test filtering by status
      const pendingResult = await executeQuery(
        `
        SELECT id, title, priority, status
        FROM todos
        WHERE user_id = $1 AND status = $2
        ORDER BY created_at DESC
      `,
        [testUserId, "pending"]
      );

      expect(pendingResult.rows.length).toBe(1);
      expect(pendingResult.rows[0].status).toBe("pending");

      // Test filtering by priority
      const highPriorityResult = await executeQuery(
        `
        SELECT id, title, priority, status
        FROM todos
        WHERE user_id = $1 AND priority = $2
        ORDER BY created_at DESC
      `,
        [testUserId, "high"]
      );

      expect(highPriorityResult.rows.length).toBe(2);
      expect(
        highPriorityResult.rows.every((todo) => todo.priority === "high")
      ).toBe(true);

      // Test search functionality
      const searchResult = await executeQuery(
        `
        SELECT id, title, priority, status
        FROM todos
        WHERE user_id = $1 AND (title ILIKE $2 OR description ILIKE $2)
        ORDER BY created_at DESC
      `,
        [testUserId, "%High%"]
      );

      expect(searchResult.rows.length).toBe(2);
      expect(
        searchResult.rows.every((todo) => todo.title.includes("High"))
      ).toBe(true);
    });

    it("should update a todo with partial fields", async () => {
      // Create a todo first
      const createResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
        [testUserId, "Original Todo", "Original description", "low", "pending"]
      );

      const todoId = createResult.rows[0].id;

      // Update only title and status
      const updateResult = await executeQuery(
        `
        UPDATE todos
        SET title = $1, status = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND user_id = $4
        RETURNING id, title, description, priority, status, updated_at
      `,
        ["Updated Todo Title", "completed", todoId, testUserId]
      );

      const updatedTodo = updateResult.rows[0];
      expect(updatedTodo).toMatchObject({
        id: todoId,
        title: "Updated Todo Title",
        description: "Original description", // Should remain unchanged
        priority: "low", // Should remain unchanged
        status: "completed",
      });
      expect(updatedTodo.updated_at).toBeDefined();
    });

    it("should delete a todo", async () => {
      // Create a todo first
      const createResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, description, priority, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
        [testUserId, "Todo to Delete", "Will be deleted", "medium", "pending"]
      );

      const todoId = createResult.rows[0].id;

      // Verify todo exists
      const checkResult = await executeQuery(
        `
        SELECT id FROM todos WHERE id = $1 AND user_id = $2
      `,
        [todoId, testUserId]
      );
      expect(checkResult.rows.length).toBe(1);

      // Delete the todo
      await executeQuery(
        `
        DELETE FROM todos
        WHERE id = $1 AND user_id = $2
      `,
        [todoId, testUserId]
      );

      // Verify it's deleted
      const deleteCheckResult = await executeQuery(
        `
        SELECT id FROM todos WHERE id = $1
      `,
        [todoId]
      );
      expect(deleteCheckResult.rows.length).toBe(0);
    });

    it("should update todo status specifically", async () => {
      // Create a todo first
      const createResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, priority, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [testUserId, "Status Test Todo", "medium", "pending"]
      );

      const todoId = createResult.rows[0].id;

      // Update status
      const statusResult = await executeQuery(
        `
        UPDATE todos
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3
        RETURNING id, title, status, updated_at
      `,
        ["completed", todoId, testUserId]
      );

      const updatedTodo = statusResult.rows[0];
      expect(updatedTodo).toMatchObject({
        id: todoId,
        title: "Status Test Todo",
        status: "completed",
      });
      expect(updatedTodo.updated_at).toBeDefined();
    });
  });

  describe("Todo Statistics", () => {
    beforeEach(async () => {
      // Create test todos for statistics
      const todos = [
        { title: "High Priority Pending", priority: "high", status: "pending" },
        {
          title: "High Priority Completed",
          priority: "high",
          status: "completed",
        },
        {
          title: "Medium Priority In Progress",
          priority: "medium",
          status: "in-progress",
        },
        {
          title: "Low Priority Completed",
          priority: "low",
          status: "completed",
        },
        {
          title: "Overdue Todo",
          priority: "high",
          status: "pending",
          dueDate: "2020-01-01",
        },
        {
          title: "Future Todo",
          priority: "medium",
          status: "pending",
          dueDate: "2025-12-31",
        },
      ];

      for (const todo of todos) {
        await executeQuery(
          `
          INSERT INTO todos (user_id, title, priority, status, due_date)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [testUserId, todo.title, todo.priority, todo.status, todo.dueDate]
        );
      }
    });

    it("should calculate comprehensive statistics", async () => {
      const result = await executeQuery(
        `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 END) as overdue,
          COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_priority,
          COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_priority,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
          ROUND(
            (COUNT(CASE WHEN status = 'completed' THEN 1 END)::decimal / NULLIF(COUNT(*), 0)) * 100, 2
          ) as completion_rate
        FROM todos
        WHERE user_id = $1
      `,
        [testUserId]
      );

      const stats = result.rows[0];

      expect(parseInt(stats.total)).toBe(6);
      expect(parseInt(stats.pending)).toBe(3);
      expect(parseInt(stats.in_progress)).toBe(1);
      expect(parseInt(stats.completed)).toBe(2);
      expect(parseInt(stats.overdue)).toBe(1);
      expect(parseInt(stats.low_priority)).toBe(1);
      expect(parseInt(stats.medium_priority)).toBe(2);
      expect(parseInt(stats.high_priority)).toBe(3);
      expect(parseFloat(stats.completion_rate)).toBe(33.33);
    });

    it("should handle empty todo list statistics", async () => {
      // Clear todos for this test
      await executeQuery("DELETE FROM todos WHERE user_id = $1", [testUserId]);

      const result = await executeQuery(
        `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 END) as overdue,
          COUNT(CASE WHEN priority = 'low' THEN 1 END) as low_priority,
          COUNT(CASE WHEN priority = 'medium' THEN 1 END) as medium_priority,
          COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority,
          ROUND(
            (COUNT(CASE WHEN status = 'completed' THEN 1 END)::decimal / NULLIF(COUNT(*), 0)) * 100, 2
          ) as completion_rate
        FROM todos
        WHERE user_id = $1
      `,
        [testUserId]
      );

      const stats = result.rows[0];

      expect(parseInt(stats.total)).toBe(0);
      expect(parseInt(stats.pending)).toBe(0);
      expect(parseInt(stats.in_progress)).toBe(0);
      expect(parseInt(stats.completed)).toBe(0);
      expect(parseInt(stats.overdue)).toBe(0);
      expect(parseInt(stats.low_priority)).toBe(0);
      expect(parseInt(stats.medium_priority)).toBe(0);
      expect(parseInt(stats.high_priority)).toBe(0);
      expect(stats.completion_rate).toBeNull();
    });
  });

  describe("Todo Validation", () => {
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

    it("should validate title length", async () => {
      const longTitle = "a".repeat(256); // Exceeds 255 character limit

      await expect(
        executeQuery(
          `
          INSERT INTO todos (user_id, title)
          VALUES ($1, $2)
        `,
          [testUserId, longTitle]
        )
      ).rejects.toThrow();
    });

    it("should validate description length", async () => {
      const longDescription = "a".repeat(1001); // Exceeds 1000 character limit

      await expect(
        executeQuery(
          `
          INSERT INTO todos (user_id, title, description)
          VALUES ($1, $2, $3)
        `,
          [testUserId, "Valid Title", longDescription]
        )
      ).rejects.toThrow();
    });
  });

  describe("Todo Authorization", () => {
    it("should only allow users to access their own todos", async () => {
      // Create another user
      const otherAuthResult = await executeQuery(`
        INSERT INTO auth (email, password)
        VALUES ('other@example.com', 'password')
        RETURNING id
      `);
      const otherAuthId = otherAuthResult.rows[0].id;

      const otherUserResult = await executeQuery(
        `
        INSERT INTO users (auth_id, full_name, username)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
        [otherAuthId, "Other User", "otheruser"]
      );
      const otherUserId = otherUserResult.rows[0].id;

      // Create todo for other user
      const otherTodoResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title)
        VALUES ($1, $2)
        RETURNING id
      `,
        [otherUserId, "Other User's Todo"]
      );
      const otherTodoId = otherTodoResult.rows[0].id;

      // Try to access other user's todo
      const accessResult = await executeQuery(
        `
        SELECT id FROM todos WHERE id = $1 AND user_id = $2
      `,
        [otherTodoId, testUserId]
      );

      expect(accessResult.rows.length).toBe(0);

      // Clean up
      await executeQuery("DELETE FROM todos WHERE user_id = $1", [otherUserId]);
      await executeQuery("DELETE FROM users WHERE id = $1", [otherUserId]);
      await executeQuery("DELETE FROM auth WHERE id = $1", [otherAuthId]);
    });
  });

  describe("Todo Logging", () => {
    it("should log todo creation", async () => {
      await executeQuery(
        `
        INSERT INTO todos (user_id, title, priority, status)
        VALUES ($1, $2, $3, $4)
      `,
        [testUserId, "Logged Todo", "high", "pending"]
      );

      const logResult = await executeQuery(
        `
        SELECT action FROM user_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
      `,
        [testUserId]
      );

      expect(logResult.rows.length).toBe(1);
      expect(logResult.rows[0].action).toBe("create_todo");
    });

    it("should log todo updates", async () => {
      const todoResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, priority, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [testUserId, "Update Test Todo", "low", "pending"]
      );

      const todoId = todoResult.rows[0].id;

      await executeQuery(
        `
        UPDATE todos
        SET title = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3
      `,
        ["Updated Title", todoId, testUserId]
      );

      const logResult = await executeQuery(
        `
        SELECT action FROM user_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
      `,
        [testUserId]
      );

      expect(logResult.rows.length).toBe(1);
      expect(logResult.rows[0].action).toBe("update_todo");
    });

    it("should log status updates", async () => {
      const todoResult = await executeQuery(
        `
        INSERT INTO todos (user_id, title, priority, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [testUserId, "Status Log Test", "medium", "pending"]
      );

      const todoId = todoResult.rows[0].id;

      await executeQuery(
        `
        UPDATE todos
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3
      `,
        ["completed", todoId, testUserId]
      );

      const logResult = await executeQuery(
        `
        SELECT action FROM user_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
      `,
        [testUserId]
      );

      expect(logResult.rows.length).toBe(1);
      expect(logResult.rows[0].action).toBe("update_todo_status_to_completed");
    });
  });

  describe("Performance and Indexes", () => {
    it("should have required indexes for performance", async () => {
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
      expect(indexes).toContain("idx_todos_created_at");
      expect(indexes).toContain("idx_todos_updated_at");
      expect(indexes).toContain("idx_todos_user_status");
      expect(indexes).toContain("idx_todos_user_priority");
      expect(indexes).toContain("idx_todos_user_due_date");
      expect(indexes).toContain("idx_todos_user_created_at");
    });

    it("should use indexes for efficient queries", async () => {
      // Create multiple todos
      for (let i = 0; i < 10; i++) {
        await executeQuery(
          `
          INSERT INTO todos (user_id, title, priority, status)
          VALUES ($1, $2, $3, $4)
        `,
          [
            testUserId,
            `Todo ${i}`,
            i % 2 === 0 ? "high" : "low",
            i % 3 === 0 ? "completed" : "pending",
          ]
        );
      }

      // Test that queries use indexes
      const explainResult = await executeQuery(
        `
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT id, title, priority, status
        FROM todos
        WHERE user_id = $1 AND status = $2
        ORDER BY created_at DESC
      `,
        [testUserId, "pending"]
      );

      const explainText = explainResult.rows
        .map((row) => row["QUERY PLAN"])
        .join("\n");

      // Check if indexes are being used
      expect(explainText).toContain("Index Scan");
      expect(explainText).toContain("idx_todos_user_status");
    });
  });
});
