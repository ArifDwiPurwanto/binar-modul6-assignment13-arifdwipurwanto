import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";
import { Todo } from "@/lib/types";

// PUT /api/todos/:id/status - Update todo status
async function updateTodoStatus(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.time("Todo Status Update Execution");

  try {
    const user = (request as any).user;
    const todoId = parseInt(params.id);
    const { status } = await request.json();

    // Validation
    if (!status || !["pending", "in-progress", "completed"].includes(status)) {
      console.timeEnd("Todo Status Update Execution");
      return NextResponse.json(
        { message: "Status must be pending, in-progress, or completed" },
        { status: 400 }
      );
    }

    // Check if todo exists and belongs to user
    const checkQuery = `
      SELECT id, user_id FROM todos WHERE id = $1
    `;
    const checkResult = await executeQuery(checkQuery, [todoId]);

    if (checkResult.rows.length === 0) {
      console.timeEnd("Todo Status Update Execution");
      return NextResponse.json({ message: "Todo not found" }, { status: 404 });
    }

    if (checkResult.rows[0].user_id !== user.userId) {
      console.timeEnd("Todo Status Update Execution");
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Update the todo status
    const updateQuery = `
      UPDATE todos
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3
      RETURNING id, user_id, title, description, priority, status, due_date, created_at, updated_at
    `;

    const result = await executeQuery(updateQuery, [
      status,
      todoId,
      user.userId,
    ]);

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

    // Log the status update
    await executeQuery(
      "INSERT INTO user_logs (user_id, action) VALUES ($1, $2)",
      [user.userId, `update_todo_status_to_${status}`]
    );

    console.timeEnd("Todo Status Update Execution");
    return NextResponse.json({
      success: true,
      data: updatedTodo,
    });
  } catch (error) {
    console.error("Todo status update error:", error);
    console.timeEnd("Todo Status Update Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export const PUT = authMiddleware(updateTodoStatus);
