import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";
import {
  CreateTodoRequest,
  Todo,
  TodoFilters,
  TodoPagination,
} from "@/lib/types";

// GET /api/todos - Get todos with pagination and filters
async function getTodos(request: NextRequest) {
  console.time("Todos Get Execution");

  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status") || null;
    const priority = searchParams.get("priority") || null;
    const search = searchParams.get("search") || null;

    const offset = (page - 1) * limit;

    // Build the query with filters
    let query = `
      SELECT 
        t.id,
        t.user_id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.due_date,
        t.created_at,
        t.updated_at
      FROM todos t
      WHERE t.user_id = $1
    `;

    const params: any[] = [user.userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (search) {
      query += ` AND (t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, "SELECT COUNT(*) FROM");
    const countResult = await executeQuery(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add ordering and pagination
    query += ` ORDER BY t.created_at DESC LIMIT $${paramIndex} OFFSET $${
      paramIndex + 1
    }`;
    params.push(limit, offset);

    const result = await executeQuery(query, params);

    const todos: Todo[] = result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const totalPages = Math.ceil(total / limit);
    const pagination: TodoPagination = {
      page,
      limit,
      total,
      totalPages,
    };

    console.timeEnd("Todos Get Execution");
    return NextResponse.json({
      success: true,
      data: {
        data: todos,
        pagination,
      },
    });
  } catch (error) {
    console.error("Todos get error:", error);
    console.timeEnd("Todos Get Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

// POST /api/todos - Create a new todo
async function createTodo(request: NextRequest) {
  console.time("Todo Create Execution");

  try {
    const user = (request as any).user;
    const {
      title,
      description,
      priority = "medium",
      status = "pending",
      dueDate,
    }: CreateTodoRequest = await request.json();

    // Validation
    const errors: Record<string, string> = {};

    if (!title || title.trim().length === 0) {
      errors.title = "Title is required";
    } else if (title.length > 255) {
      errors.title = "Title must be 255 characters or less";
    }

    if (description && description.length > 1000) {
      errors.description = "Description must be 1000 characters or less";
    }

    if (priority && !["low", "medium", "high"].includes(priority)) {
      errors.priority = "Priority must be low, medium, or high";
    }

    if (status && !["pending", "in-progress", "completed"].includes(status)) {
      errors.status = "Status must be pending, in-progress, or completed";
    }

    if (dueDate) {
      const date = new Date(dueDate);
      if (isNaN(date.getTime())) {
        errors.dueDate = "Invalid date format";
      }
    }

    if (Object.keys(errors).length > 0) {
      console.timeEnd("Todo Create Execution");
      return NextResponse.json(
        { message: "Validation failed", errors },
        { status: 400 }
      );
    }

    // Insert the todo
    const insertQuery = `
      INSERT INTO todos (user_id, title, description, priority, status, due_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, title, description, priority, status, due_date, created_at, updated_at
    `;

    const result = await executeQuery(insertQuery, [
      user.userId,
      title.trim(),
      description?.trim() || null,
      priority,
      status,
      dueDate || null,
    ]);

    const newTodo: Todo = {
      id: result.rows[0].id,
      userId: result.rows[0].user_id,
      title: result.rows[0].title,
      description: result.rows[0].description,
      priority: result.rows[0].priority,
      status: result.rows[0].status,
      dueDate: result.rows[0].due_date,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
    };

    // Log the todo creation
    await executeQuery(
      "INSERT INTO user_logs (user_id, action) VALUES ($1, $2)",
      [user.userId, "create_todo"]
    );

    console.timeEnd("Todo Create Execution");
    return NextResponse.json({
      success: true,
      data: newTodo,
    });
  } catch (error) {
    console.error("Todo create error:", error);
    console.timeEnd("Todo Create Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export const GET = authMiddleware(getTodos);
export const POST = authMiddleware(createTodo);
