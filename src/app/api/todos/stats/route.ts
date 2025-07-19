import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";
import { TodoStats } from "@/lib/types";

// GET /api/todos/stats - Get todo statistics
async function getTodoStats(request: NextRequest) {
  console.time("Todo Stats Get Execution");

  try {
    const user = (request as any).user;

    const statsQuery = `
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
    `;

    const result = await executeQuery(statsQuery, [user.userId]);
    const stats = result.rows[0];

    const todoStats: TodoStats = {
      total: parseInt(stats.total),
      pending: parseInt(stats.pending),
      inProgress: parseInt(stats.in_progress),
      completed: parseInt(stats.completed),
      overdue: parseInt(stats.overdue),
      lowPriority: parseInt(stats.low_priority),
      mediumPriority: parseInt(stats.medium_priority),
      highPriority: parseInt(stats.high_priority),
      completionRate: parseFloat(stats.completion_rate) || 0,
    };

    console.timeEnd("Todo Stats Get Execution");
    return NextResponse.json({
      success: true,
      data: todoStats,
    });
  } catch (error) {
    console.error("Todo stats get error:", error);
    console.timeEnd("Todo Stats Get Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export const GET = authMiddleware(getTodoStats);
