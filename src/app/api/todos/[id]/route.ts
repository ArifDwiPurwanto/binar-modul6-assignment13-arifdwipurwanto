import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";
import { UpdateTodoRequest, Todo } from "@/lib/types";

// PUT /api/todos/:id - Update a specific todo
async function updateTodo(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.time("Todo Update Execution");

  try {
    const user = (request as any).user;
    const todoId = parseInt(params.id);
    const { title, description, priority, status, dueDate }: UpdateTodoRequest =
      await request.json();

    // Validation
    const errors: Record<string, string> = {};

    if (title !== undefined) {
      if (!title || title.trim().length === 0) {
        errors.title = "Title is required";
      } else if (title.length > 255) {
        errors.title = "Title must be 255 characters or less";
      }
    }

    if (description !== undefined && description && description.length > 1000) {
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
      console.timeEnd("Todo Update Execution");
      return NextResponse.json(
        { message: "Validation failed", errors },
        { status: 400 }
      );
    }

    // Check if todo exists and belongs to user
    const checkQuery = `
      SELECT id, user_id FROM todos WHERE id = $1
    `;
    const checkResult = await executeQuery(checkQuery, [todoId]);

    if (checkResult.rows.length === 0) {
      console.timeEnd("Todo Update Execution");
      return NextResponse.json({ message: "Todo not found" }, { status: 404 });
    }

    if (checkResult.rows[0].user_id !== user.userId) {
      console.timeEnd("Todo Update Execution");
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex}`);
      updateValues.push(title.trim());
      paramIndex++;
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description?.trim() || null);
      paramIndex++;
    }

    if (priority !== undefined) {
      updateFields.push(`priority = $${paramIndex}`);
      updateValues.push(priority);
      paramIndex++;
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(status);
      paramIndex++;
    }

    if (dueDate !== undefined) {
      updateFields.push(`due_date = $${paramIndex}`);
      updateValues.push(dueDate || null);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      console.timeEnd("Todo Update Execution");
      return NextResponse.json(
        { message: "No fields to update" },
        { status: 400 }
      );
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const updateQuery = `
      UPDATE todos
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING id, user_id, title, description, priority, status, due_date, created_at, updated_at
    `;

    updateValues.push(todoId, user.userId);

    const result = await executeQuery(updateQuery, updateValues);

    const updatedTodo: Todo = {
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

    // Log the todo update
    await executeQuery(
      "INSERT INTO user_logs (user_id, action) VALUES ($1, $2)",
      [user.userId, "update_todo"]
    );

    console.timeEnd("Todo Update Execution");
    return NextResponse.json({
      success: true,
      data: updatedTodo,
    });
  } catch (error) {
    console.error("Todo update error:", error);
    console.timeEnd("Todo Update Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

// DELETE /api/todos/:id - Delete a specific todo
async function deleteTodo(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.time("Todo Delete Execution");

  try {
    const user = (request as any).user;
    const todoId = parseInt(params.id);

    // Check if todo exists and belongs to user
    const checkQuery = `
      SELECT id, user_id FROM todos WHERE id = $1
    `;
    const checkResult = await executeQuery(checkQuery, [todoId]);

    if (checkResult.rows.length === 0) {
      console.timeEnd("Todo Delete Execution");
      return NextResponse.json({ message: "Todo not found" }, { status: 404 });
    }

    if (checkResult.rows[0].user_id !== user.userId) {
      console.timeEnd("Todo Delete Execution");
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Delete the todo
    const deleteQuery = `
      DELETE FROM todos
      WHERE id = $1 AND user_id = $2
    `;

    await executeQuery(deleteQuery, [todoId, user.userId]);

    // Log the todo deletion
    await executeQuery(
      "INSERT INTO user_logs (user_id, action) VALUES ($1, $2)",
      [user.userId, "delete_todo"]
    );

    console.timeEnd("Todo Delete Execution");
    return NextResponse.json({
      success: true,
      message: "Todo deleted successfully",
    });
  } catch (error) {
    console.error("Todo delete error:", error);
    console.timeEnd("Todo Delete Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export const PUT = authMiddleware(updateTodo);
export const DELETE = authMiddleware(deleteTodo);
