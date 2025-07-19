import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";

export async function POST() {
  console.log("🧪 Testing database connection and basic operations...");

  try {
    // Test 1: Check if we can connect to database
    console.log("📊 Testing database connection...");

    const testQuery = await executeQuery("SELECT 1 as test");
    console.log("✅ Database connection successful");

    // Test 2: Check if users table exists
    console.log("📋 Checking if users table exists...");

    try {
      const userCount = await executeQuery(
        "SELECT COUNT(*) as count FROM users"
      );
      const count = parseInt(userCount.rows[0].count);
      console.log(`✅ Users table exists with ${count} records`);

      return NextResponse.json({
        message: "Database connection and users table test successful",
        userCount: count,
        status: "success",
      });
    } catch (error) {
      console.log("❌ Users table not found");
      return NextResponse.json(
        {
          message: "Users table not found",
          error: "Table does not exist",
          status: "error",
        },
        { status: 404 }
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("💥 Database connection failed:", errorMessage);

    return NextResponse.json(
      {
        message: "Database connection failed",
        error: errorMessage,
        status: "error",
      },
      { status: 500 }
    );
  }
}
