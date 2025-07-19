import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";

export async function POST(request: Request) {
  console.log("🚀 Creating PostgreSQL indexes for performance optimization...");

  const indexQueries = [
    // Primary indexes for JOINs
    "CREATE INDEX IF NOT EXISTS idx_auth_id ON auth(id)",
    "CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_divisions_user_id ON user_divisions(user_id)",

    // Composite indexes for better performance
    "CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role)",
    "CREATE INDEX IF NOT EXISTS idx_user_divisions_user_division ON user_divisions(user_id, division_name)",

    // Additional indexes for future queries
    "CREATE INDEX IF NOT EXISTS idx_auth_email ON auth(email)",
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",

    // Analyze tables to update statistics
    "ANALYZE users",
    "ANALYZE auth",
    "ANALYZE user_roles",
    "ANALYZE user_divisions",
  ];

  const results: any[] = [];
  const errors: any[] = [];

  try {
    for (const query of indexQueries) {
      try {
        console.log(`📝 Executing: ${query}`);
        await executeQuery(query);
        results.push({ query, status: "success" });
        console.log(
          `✅ Success: ${query.split(" ")[0]} ${query.split(" ")[1]}`
        );
      } catch (error: any) {
        console.error(`❌ Error executing: ${query}`, error.message);
        errors.push({ query, error: error.message });
      }
    }

    // Check index usage statistics
    console.log("📊 Checking index usage statistics...");
    const statsQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public' 
        AND tablename IN ('users', 'auth', 'user_roles', 'user_divisions')
      ORDER BY tablename, idx_scan DESC
    `;

    const stats = await executeQuery(statsQuery);
    console.log("📈 Index Usage Statistics:", stats.rows);

    return NextResponse.json({
      message: "Index creation completed",
      results,
      errors,
      stats: stats.rows,
      summary: {
        total: indexQueries.length,
        successful: results.length,
        failed: errors.length,
      },
    });
  } catch (error: any) {
    console.error("💥 Failed to create indexes:", error);
    return NextResponse.json(
      {
        message: "Failed to create indexes",
        error: error.message,
        results,
        errors,
      },
      { status: 500 }
    );
  }
}
