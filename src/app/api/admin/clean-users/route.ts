import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";

export async function POST() {
  console.log("🧹 Starting users data cleaning process...");

  try {
    // Step 1: Check if users table exists and has data
    console.log("📊 Checking database state...");

    let totalUsers = 0;
    try {
      const userCount = await executeQuery(
        "SELECT COUNT(*) as count FROM users"
      );
      totalUsers = parseInt(userCount.rows[0].count);
      console.log(`Total users found: ${totalUsers}`);
    } catch (error) {
      console.log("❌ Users table not found or empty");
      return NextResponse.json(
        {
          message: "Users table not found or empty",
          error: "No users data to clean",
        },
        { status: 404 }
      );
    }

    if (totalUsers === 0) {
      return NextResponse.json({
        message: "No users found to clean",
        totalUsers: 0,
      });
    }

    // Step 2: Create backup
    console.log("💾 Creating backup...");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const backupTableName = `users_backup_${timestamp}`;

    try {
      await executeQuery(
        `CREATE TABLE ${backupTableName} AS SELECT * FROM users`
      );
      console.log(`✅ Backup created: ${backupTableName}`);
    } catch (error) {
      console.log("❌ Failed to create backup");
      return NextResponse.json(
        {
          message: "Failed to create backup",
          error: "Cannot proceed without backup",
        },
        { status: 500 }
      );
    }

    // Step 3: Analyze current data (safe queries)
    console.log("📊 Analyzing data...");

    const analysis = {
      nullCounts: {},
      duplicateCounts: { usernames: 0, authIds: 0 },
    };

    // Check NULL values safely
    try {
      const nullStats = await executeQuery(`
        SELECT 
          COUNT(CASE WHEN full_name IS NULL THEN 1 END) as null_names,
          COUNT(CASE WHEN username IS NULL THEN 1 END) as null_usernames,
          COUNT(CASE WHEN bio IS NULL THEN 1 END) as null_bios,
          COUNT(CASE WHEN address IS NULL THEN 1 END) as null_addresses,
          COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as null_phones
        FROM users
      `);

      analysis.nullCounts = nullStats.rows[0];
      console.log("✅ NULL analysis completed");
    } catch (error) {
      console.log("⚠️ Could not analyze NULL values");
    }

    // Check duplicates safely
    try {
      const duplicateUsernames = await executeQuery(`
        SELECT COUNT(*) as count
        FROM (
          SELECT username
          FROM users 
          WHERE username IS NOT NULL
          GROUP BY username 
          HAVING COUNT(*) > 1
        ) t
      `);
      analysis.duplicateCounts.usernames = parseInt(
        duplicateUsernames.rows[0].count
      );
    } catch (error) {
      console.log("⚠️ Could not analyze username duplicates");
    }

    try {
      const duplicateAuthIds = await executeQuery(`
        SELECT COUNT(*) as count
        FROM (
          SELECT auth_id
          FROM users 
          WHERE auth_id IS NOT NULL
          GROUP BY auth_id 
          HAVING COUNT(*) > 1
        ) t
      `);
      analysis.duplicateCounts.authIds = parseInt(
        duplicateAuthIds.rows[0].count
      );
    } catch (error) {
      console.log("⚠️ Could not analyze auth_id duplicates");
    }

    // Step 4: Clean NULL values safely
    console.log("🧹 Cleaning NULL values...");
    const nullUpdates = [
      { column: "full_name", value: "'Unknown User'" },
      { column: "username", value: "'user_' || id" },
      { column: "bio", value: "'No bio available'" },
      { column: "address", value: "'Address not provided'" },
      { column: "phone_number", value: "'No phone provided'" },
    ];

    const nullUpdateResults = [];
    for (const update of nullUpdates) {
      try {
        await executeQuery(
          `UPDATE users SET ${update.column} = ${update.value} WHERE ${update.column} IS NULL`
        );
        nullUpdateResults.push({ column: update.column, status: "success" });
        console.log(`  ✅ Updated NULL ${update.column}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        nullUpdateResults.push({
          column: update.column,
          status: "error",
          error: errorMessage,
        });
        console.log(`  ❌ Failed to update ${update.column}: ${errorMessage}`);
      }
    }

    // Step 5: Handle duplicate usernames safely
    console.log("🔄 Handling duplicate usernames...");
    try {
      await executeQuery(`
        UPDATE users 
        SET username = username || '_' || id
        WHERE id IN (
          SELECT u2.id
          FROM users u1
          JOIN users u2 ON u1.username = u2.username AND u1.id < u2.id
          WHERE u1.username IS NOT NULL
        )
      `);
      console.log("  ✅ Duplicate usernames handled");
    } catch (error) {
      console.log("  ⚠️ Could not handle duplicate usernames");
    }

    // Step 6: Handle duplicate auth_ids safely
    console.log("🔄 Handling duplicate auth_ids...");
    try {
      await executeQuery(`
        DELETE FROM users 
        WHERE id IN (
          SELECT u2.id
          FROM users u1
          JOIN users u2 ON u1.auth_id = u2.auth_id AND u1.id < u2.id
          WHERE u1.auth_id IS NOT NULL
        )
      `);
      console.log("  ✅ Duplicate auth_ids handled");
    } catch (error) {
      console.log("  ⚠️ Could not handle duplicate auth_ids");
    }

    // Step 7: Clean orphaned records safely
    console.log("🧹 Cleaning orphaned records...");
    try {
      await executeQuery(`
        DELETE FROM users 
        WHERE auth_id IS NOT NULL 
          AND auth_id NOT IN (SELECT id FROM auth)
      `);
      console.log("  ✅ Orphaned records cleaned");
    } catch (error) {
      console.log("  ⚠️ Could not clean orphaned records");
    }

    // Step 8: Update sequences safely
    console.log("🔄 Updating sequences...");
    try {
      await executeQuery(
        `SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`
      );
      console.log("  ✅ Sequences updated");
    } catch (error) {
      console.log("  ⚠️ Could not update sequences");
    }

    // Step 9: Final validation
    console.log("📊 Final validation...");

    let finalCount = 0;
    try {
      const finalCountResult = await executeQuery(
        "SELECT COUNT(*) as count FROM users"
      );
      finalCount = parseInt(finalCountResult.rows[0].count);
      console.log(`Final user count: ${finalCount}`);
    } catch (error) {
      console.log("❌ Could not get final count");
    }

    // Step 10: Final data quality check
    console.log("📈 Data quality summary...");
    let qualitySummary = {
      total_users: finalCount,
      users_with_name: 0,
      users_with_username: 0,
      users_with_bio: 0,
      users_with_address: 0,
      users_with_phone: 0,
    };

    try {
      const qualityResult = await executeQuery(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN full_name IS NOT NULL THEN 1 END) as users_with_name,
          COUNT(CASE WHEN username IS NOT NULL THEN 1 END) as users_with_username,
          COUNT(CASE WHEN bio IS NOT NULL THEN 1 END) as users_with_bio,
          COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as users_with_address,
          COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as users_with_phone
        FROM users
      `);
      qualitySummary = qualityResult.rows[0];
    } catch (error) {
      console.log("⚠️ Could not get quality summary");
    }

    console.log("🎉 Data cleaning completed!");
    console.log(`💾 Backup saved as: ${backupTableName}`);

    return NextResponse.json({
      message: "Users data cleaning completed successfully",
      backupTable: backupTableName,
      initialCount: totalUsers,
      finalCount: finalCount,
      usersRemoved: totalUsers - finalCount,
      analysis: analysis,
      nullUpdateResults: nullUpdateResults,
      qualitySummary: qualitySummary,
      rollbackInstructions: {
        dropTable: "DROP TABLE users;",
        restoreBackup: `ALTER TABLE ${backupTableName} RENAME TO users;`,
        resetSequence:
          "SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));",
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("💥 Error during data cleaning:", errorMessage);
    return NextResponse.json(
      {
        message: "Failed to clean users data",
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
