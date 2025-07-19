import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";

interface DebugStep {
  step: string;
  status: "checking" | "success" | "failed";
  error?: string;
  data?: Record<string, unknown>;
}

interface DebugResults {
  steps: DebugStep[];
  errors: string[];
  success: boolean;
}

export async function POST() {
  console.log("🔍 Starting debug mode for data cleaning...");

  const debugResults: DebugResults = {
    steps: [],
    errors: [],
    success: false,
  };

  try {
    // Step 1: Check database connection
    debugResults.steps.push({
      step: "Database Connection",
      status: "checking",
    });
    try {
      await executeQuery("SELECT 1 as test");
      debugResults.steps.push({
        step: "Database Connection",
        status: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Database Connection",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`Database connection failed: ${errorMessage}`);
    }

    // Step 2: Check users table
    debugResults.steps.push({ step: "Users Table Check", status: "checking" });
    try {
      const userCount = await executeQuery(
        "SELECT COUNT(*) as count FROM users"
      );
      const count = parseInt(userCount.rows[0].count);
      debugResults.steps.push({
        step: "Users Table Check",
        status: "success",
        data: { userCount: count },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Users Table Check",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`Users table check failed: ${errorMessage}`);
    }

    // Step 3: Check table structure
    debugResults.steps.push({
      step: "Table Structure Check",
      status: "checking",
    });
    try {
      const structure = await executeQuery(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `);
      debugResults.steps.push({
        step: "Table Structure Check",
        status: "success",
        data: { columns: structure.rows },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Table Structure Check",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`Table structure check failed: ${errorMessage}`);
    }

    // Step 4: Test backup creation
    debugResults.steps.push({
      step: "Backup Creation Test",
      status: "checking",
    });
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const backupTableName = `debug_backup_${timestamp}`;

      await executeQuery(
        `CREATE TABLE ${backupTableName} AS SELECT * FROM users LIMIT 1`
      );
      await executeQuery(`DROP TABLE ${backupTableName}`);

      debugResults.steps.push({
        step: "Backup Creation Test",
        status: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Backup Creation Test",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`Backup creation test failed: ${errorMessage}`);
    }

    // Step 5: Test NULL value updates
    debugResults.steps.push({ step: "NULL Update Test", status: "checking" });
    try {
      // Test with a safe column first
      await executeQuery(
        `UPDATE users SET bio = bio WHERE bio IS NULL LIMIT 1`
      );
      debugResults.steps.push({ step: "NULL Update Test", status: "success" });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "NULL Update Test",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`NULL update test failed: ${errorMessage}`);
    }

    // Step 6: Test duplicate detection
    debugResults.steps.push({
      step: "Duplicate Detection Test",
      status: "checking",
    });
    try {
      const duplicateCheck = await executeQuery(`
        SELECT COUNT(*) as count
        FROM (
          SELECT username
          FROM users 
          WHERE username IS NOT NULL
          GROUP BY username 
          HAVING COUNT(*) > 1
        ) t
      `);
      debugResults.steps.push({
        step: "Duplicate Detection Test",
        status: "success",
        data: { duplicateCount: duplicateCheck.rows[0].count },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Duplicate Detection Test",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(
        `Duplicate detection test failed: ${errorMessage}`
      );
    }

    // Step 7: Check permissions
    debugResults.steps.push({
      step: "Database Permissions Check",
      status: "checking",
    });
    try {
      const permissions = await executeQuery(`
        SELECT 
          has_table_privilege('users', 'SELECT') as can_select,
          has_table_privilege('users', 'UPDATE') as can_update,
          has_table_privilege('users', 'DELETE') as can_delete,
          has_table_privilege('users', 'INSERT') as can_insert
      `);
      debugResults.steps.push({
        step: "Database Permissions Check",
        status: "success",
        data: permissions.rows[0],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      debugResults.steps.push({
        step: "Database Permissions Check",
        status: "failed",
        error: errorMessage,
      });
      debugResults.errors.push(`Permissions check failed: ${errorMessage}`);
    }

    // Determine overall success
    const failedSteps = debugResults.steps.filter(
      (step) => step.status === "failed"
    );
    debugResults.success = failedSteps.length === 0;

    console.log("🔍 Debug completed");
    console.log("Steps:", debugResults.steps);
    console.log("Errors:", debugResults.errors);

    return NextResponse.json({
      message: debugResults.success ? "All tests passed" : "Some tests failed",
      success: debugResults.success,
      steps: debugResults.steps,
      errors: debugResults.errors,
      summary: {
        totalSteps: debugResults.steps.length,
        successfulSteps: debugResults.steps.filter(
          (s) => s.status === "success"
        ).length,
        failedSteps: failedSteps.length,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("💥 Debug process failed:", errorMessage);

    return NextResponse.json(
      {
        message: "Debug process failed",
        error: errorMessage,
        success: false,
        steps: debugResults.steps,
        errors: [...debugResults.errors, errorMessage],
      },
      { status: 500 }
    );
  }
}
