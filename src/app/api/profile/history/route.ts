import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";

async function getProfileHistory(request: NextRequest) {
  console.time("Profile History Get Execution");

  try {
    const user = (request as any).user;
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_profile_updates
      WHERE user_id = $1
    `;
    const countResult = await executeQuery(countQuery, [user.userId]);
    const total = parseInt(countResult.rows[0].total);

    // Get profile update history
    const historyQuery = `
      SELECT 
        id,
        updated_fields,
        created_at
      FROM user_profile_updates
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await executeQuery(historyQuery, [
      user.userId,
      limit,
      offset,
    ]);

    const history = result.rows.map((row: any) => ({
      id: row.id,
      updatedFields: row.updated_fields,
      createdAt: row.created_at,
    }));

    const totalPages = Math.ceil(total / limit);

    console.timeEnd("Profile History Get Execution");
    return NextResponse.json({
      success: true,
      data: {
        history,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("Profile history get error:", error);
    console.timeEnd("Profile History Get Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export const GET = authMiddleware(getProfileHistory);
