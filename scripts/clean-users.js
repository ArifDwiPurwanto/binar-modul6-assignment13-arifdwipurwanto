const { executeQuery } = require("../src/lib/database.js");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function cleanUsersData() {
  console.log("🧹 Users Table Data Cleaning Script");
  console.log("=====================================\n");

  try {
    // Step 1: Show current data state
    console.log("📊 Analyzing current data state...\n");

    const totalUsers = await executeQuery(
      "SELECT COUNT(*) as count FROM users"
    );
    console.log(`Total users: ${totalUsers.rows[0].count}`);

    // Check NULL values
    const nullStats = await executeQuery(`
      SELECT 
        'full_name' as column_name,
        COUNT(*) as null_count
      FROM users 
      WHERE full_name IS NULL
      UNION ALL
      SELECT 
        'username' as column_name,
        COUNT(*) as null_count
      FROM users 
      WHERE username IS NULL
      UNION ALL
      SELECT 
        'bio' as column_name,
        COUNT(*) as null_count
      FROM users 
      WHERE bio IS NULL
      UNION ALL
      SELECT 
        'address' as column_name,
        COUNT(*) as null_count
      FROM users 
      WHERE address IS NULL
      UNION ALL
      SELECT 
        'phone_number' as column_name,
        COUNT(*) as null_count
      FROM users 
      WHERE phone_number IS NULL
    `);

    console.log("\n📋 NULL values found:");
    nullStats.rows.forEach((row) => {
      if (row.null_count > 0) {
        console.log(`  - ${row.column_name}: ${row.null_count}`);
      }
    });

    // Check duplicates
    const duplicateUsernames = await executeQuery(`
      SELECT username, COUNT(*) as count
      FROM users 
      WHERE username IS NOT NULL
      GROUP BY username 
      HAVING COUNT(*) > 1
    `);

    const duplicateAuthIds = await executeQuery(`
      SELECT auth_id, COUNT(*) as count
      FROM users 
      WHERE auth_id IS NOT NULL
      GROUP BY auth_id 
      HAVING COUNT(*) > 1
    `);

    console.log("\n🔄 Duplicates found:");
    console.log(`  - Duplicate usernames: ${duplicateUsernames.rows.length}`);
    console.log(`  - Duplicate auth_ids: ${duplicateAuthIds.rows.length}`);

    // Step 2: Ask for confirmation
    console.log("\n⚠️  WARNING: This will modify your data!");
    console.log("The script will:");
    console.log("  - Create a backup of current data");
    console.log("  - Replace NULL values with defaults");
    console.log("  - Handle duplicate usernames and auth_ids");
    console.log("  - Remove completely duplicate rows");
    console.log("  - Clean orphaned records");

    const confirm = await question("\nDo you want to proceed? (yes/no): ");

    if (confirm.toLowerCase() !== "yes") {
      console.log("❌ Operation cancelled.");
      rl.close();
      return;
    }

    // Step 3: Create backup
    console.log("\n💾 Creating backup...");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const backupTableName = `users_backup_${timestamp}`;

    await executeQuery(
      `CREATE TABLE ${backupTableName} AS SELECT * FROM users`
    );
    console.log(`✅ Backup created: ${backupTableName}`);

    // Step 4: Clean NULL values
    console.log("\n🧹 Cleaning NULL values...");

    const nullUpdates = [
      { column: "full_name", value: "'Unknown User'" },
      { column: "username", value: "'user_' || id" },
      { column: "bio", value: "'No bio available'" },
      { column: "address", value: "'Address not provided'" },
      { column: "phone_number", value: "'No phone provided'" },
      { column: "profile_json", value: "'{}'" },
    ];

    for (const update of nullUpdates) {
      await executeQuery(
        `UPDATE users SET ${update.column} = ${update.value} WHERE ${update.column} IS NULL`
      );
      console.log(`  ✅ Updated NULL ${update.column}`);
    }

    // Step 5: Handle duplicate usernames
    console.log("\n🔄 Handling duplicate usernames...");
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

    // Step 6: Handle duplicate auth_ids
    console.log("\n🔄 Handling duplicate auth_ids...");
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

    // Step 7: Remove completely duplicate rows
    console.log("\n🔄 Removing completely duplicate rows...");
    await executeQuery(`
      DELETE FROM users 
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM users
        GROUP BY full_name, username, auth_id, birth_date, bio, long_bio, 
                 profile_json, address, phone_number, created_at, updated_at
      )
    `);
    console.log("  ✅ Completely duplicate rows removed");

    // Step 8: Clean orphaned records
    console.log("\n🧹 Cleaning orphaned records...");
    await executeQuery(`
      DELETE FROM users 
      WHERE auth_id IS NOT NULL 
        AND auth_id NOT IN (SELECT id FROM auth)
    `);
    console.log("  ✅ Orphaned records cleaned");

    // Step 9: Update sequences
    console.log("\n🔄 Updating sequences...");
    await executeQuery(
      `SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`
    );
    console.log("  ✅ Sequences updated");

    // Step 10: Final validation
    console.log("\n📊 Final validation...");

    const finalCount = await executeQuery(
      "SELECT COUNT(*) as count FROM users"
    );
    console.log(`Final user count: ${finalCount.rows[0].count}`);

    const finalNullCheck = await executeQuery(`
      SELECT 
        COUNT(CASE WHEN full_name IS NULL THEN 1 END) as null_names,
        COUNT(CASE WHEN username IS NULL THEN 1 END) as null_usernames
      FROM users
    `);

    const finalNulls = finalNullCheck.rows[0];
    console.log(
      `Remaining NULL values: full_name=${finalNulls.null_names}, username=${finalNulls.null_usernames}`
    );

    const finalDuplicates = await executeQuery(`
      SELECT COUNT(*) as duplicate_count
      FROM (
        SELECT username
        FROM users 
        GROUP BY username 
        HAVING COUNT(*) > 1
      ) t
    `);
    console.log(
      `Remaining duplicates: ${finalDuplicates.rows[0].duplicate_count}`
    );

    // Step 11: Data quality summary
    console.log("\n📈 Data quality summary:");
    const qualitySummary = await executeQuery(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN full_name IS NOT NULL THEN 1 END) as users_with_name,
        COUNT(CASE WHEN username IS NOT NULL THEN 1 END) as users_with_username,
        COUNT(CASE WHEN bio IS NOT NULL THEN 1 END) as users_with_bio,
        COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as users_with_address,
        COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as users_with_phone,
        COUNT(CASE WHEN profile_json IS NOT NULL THEN 1 END) as users_with_profile
      FROM users
    `);

    const summary = qualitySummary.rows[0];
    console.log(`  Total users: ${summary.total_users}`);
    console.log(`  Users with name: ${summary.users_with_name}`);
    console.log(`  Users with username: ${summary.users_with_username}`);
    console.log(`  Users with bio: ${summary.users_with_bio}`);
    console.log(`  Users with address: ${summary.users_with_address}`);
    console.log(`  Users with phone: ${summary.users_with_phone}`);
    console.log(`  Users with profile: ${summary.users_with_profile}`);

    console.log("\n🎉 Data cleaning completed successfully!");
    console.log(`💾 Backup saved as: ${backupTableName}`);
    console.log("\n📝 Rollback instructions:");
    console.log(`  1. DROP TABLE users;`);
    console.log(`  2. ALTER TABLE ${backupTableName} RENAME TO users;`);
    console.log(
      `  3. SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));`
    );
  } catch (error) {
    console.error("❌ Error during data cleaning:", error.message);
    console.error("Stack trace:", error.stack);
  } finally {
    rl.close();
  }
}

// Run the script
if (require.main === module) {
  cleanUsersData()
    .then(() => {
      console.log("\n✨ Script completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Script failed:", error);
      process.exit(1);
    });
}

module.exports = { cleanUsersData };
