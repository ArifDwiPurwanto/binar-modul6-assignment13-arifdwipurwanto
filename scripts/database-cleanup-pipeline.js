#!/usr/bin/env node

/**
 * Database Cleanup & ETL Pipeline Automation
 *
 * This script provides comprehensive database cleaning and ETL operations
 * that can be automated as part of CI/CD pipeline or run manually.
 *
 * Features:
 * - Automated data quality checks
 * - Comprehensive data cleaning
 * - Performance optimization
 * - Backup and rollback capabilities
 * - Detailed logging and reporting
 * - Pipeline automation for code pushes
 */

const { Pool } = require("pg");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config({ path: ".env.local" });

// Configuration
const config = {
  database: {
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "workshop_db",
    password: process.env.DB_PASSWORD || "admin123",
    port: parseInt(process.env.DB_PORT || "5432"),
    ssl:
      process.env.DB_HOST && process.env.DB_HOST !== "localhost"
        ? { rejectUnauthorized: false }
        : false,
  },
  backup: {
    enabled: true,
    retention: 7, // days
    compress: true,
  },
  cleaning: {
    removeNulls: true,
    handleDuplicates: true,
    cleanOrphans: true,
    optimizeIndexes: true,
    vacuum: true,
  },
  logging: {
    level: "info", // debug, info, warn, error
    file: "logs/database-cleanup.log",
  },
};

class DatabaseCleanupPipeline {
  constructor() {
    this.pool = new Pool(config.database);
    this.logs = [];
    this.startTime = new Date();
    this.backupTables = [];
  }

  async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };

    this.logs.push(logEntry);

    // Console output based on log level
    const shouldLog =
      ["error", "warn"].includes(level) ||
      (level === "info" && ["info", "debug"].includes(config.logging.level)) ||
      (level === "debug" && config.logging.level === "debug");

    if (shouldLog) {
      const prefix = {
        error: "❌",
        warn: "⚠️",
        info: "ℹ️",
        debug: "🔍",
      }[level];

      console.log(`${prefix} [${timestamp}] ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  async executeQuery(query, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } catch (error) {
      await this.log("error", "Database query failed", {
        query,
        error: error.message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async createBackup() {
    if (!config.backup.enabled) {
      await this.log("info", "Backup disabled, skipping...");
      return;
    }

    await this.log("info", "Creating database backup...");

    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.-]/g, "_")
        .slice(0, 19);

      // Backup critical tables
      const tablesToBackup = [
        "users",
        "auth",
        "todos",
        "user_profile_updates",
        "user_logs",
      ];

      for (const table of tablesToBackup) {
        const backupTableName = `${table}_backup_${timestamp}`;

        // Check if table exists
        const tableExists = await this.executeQuery(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `,
          [table]
        );

        if (tableExists.rows[0].exists) {
          await this.executeQuery(
            `CREATE TABLE ${backupTableName} AS SELECT * FROM ${table}`
          );
          this.backupTables.push(backupTableName);
          await this.log("info", `Backup created: ${backupTableName}`);
        } else {
          await this.log(
            "warn",
            `Table ${table} does not exist, skipping backup`
          );
        }
      }

      await this.log(
        "info",
        `Backup completed. Created ${this.backupTables.length} backup tables`
      );
    } catch (error) {
      await this.log("error", "Backup creation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async analyzeDataQuality() {
    await this.log("info", "Analyzing data quality...");

    try {
      const analysis = {};

      // Analyze users table
      if (await this.tableExists("users")) {
        analysis.users = await this.executeQuery(`
          SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN full_name IS NULL THEN 1 END) as null_full_names,
            COUNT(CASE WHEN username IS NULL THEN 1 END) as null_usernames,
            COUNT(CASE WHEN bio IS NULL THEN 1 END) as null_bios,
            COUNT(CASE WHEN address IS NULL THEN 1 END) as null_addresses,
            COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as null_phones,
            COUNT(CASE WHEN profile_picture_url IS NULL THEN 1 END) as null_profile_pictures,
            (SELECT COUNT(*) FROM (
              SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING COUNT(*) > 1
            ) t) as duplicate_usernames,
            (SELECT COUNT(*) FROM (
              SELECT auth_id FROM users WHERE auth_id IS NOT NULL GROUP BY auth_id HAVING COUNT(*) > 1
            ) t) as duplicate_auth_ids,
            (SELECT COUNT(*) FROM users WHERE auth_id IS NOT NULL AND auth_id NOT IN (SELECT id FROM auth)) as orphaned_users
          FROM users
        `);
      }

      // Analyze todos table
      if (await this.tableExists("todos")) {
        analysis.todos = await this.executeQuery(`
          SELECT 
            COUNT(*) as total_todos,
            COUNT(CASE WHEN title IS NULL THEN 1 END) as null_titles,
            COUNT(CASE WHEN user_id IS NULL THEN 1 END) as null_user_ids,
            COUNT(CASE WHEN priority IS NULL THEN 1 END) as null_priorities,
            COUNT(CASE WHEN status IS NULL THEN 1 END) as null_statuses,
            (SELECT COUNT(*) FROM todos WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users)) as orphaned_todos,
            COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'completed' THEN 1 END) as overdue_todos
          FROM todos
        `);
      }

      // Analyze auth table
      if (await this.tableExists("auth")) {
        analysis.auth = await this.executeQuery(`
          SELECT 
            COUNT(*) as total_auth,
            COUNT(CASE WHEN email IS NULL THEN 1 END) as null_emails,
            COUNT(CASE WHEN password IS NULL THEN 1 END) as null_passwords,
            (SELECT COUNT(*) FROM (
              SELECT email FROM auth WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1
            ) t) as duplicate_emails
          FROM auth
        `);
      }

      await this.log("info", "Data quality analysis completed", analysis);
      return analysis;
    } catch (error) {
      await this.log("error", "Data quality analysis failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async cleanNullValues() {
    if (!config.cleaning.removeNulls) {
      await this.log("info", "NULL value cleaning disabled, skipping...");
      return;
    }

    await this.log("info", "Cleaning NULL values...");

    try {
      // Clean users table NULL values
      if (await this.tableExists("users")) {
        const userNullUpdates = [
          { column: "full_name", value: "'Unknown User'" },
          { column: "username", value: "'user_' || id" },
          { column: "bio", value: "'No bio available'" },
          { column: "long_bio", value: "'No long bio available'" },
          { column: "address", value: "'Address not provided'" },
          { column: "phone_number", value: "'No phone provided'" },
          { column: "profile_json", value: "'{}'" },
          { column: "profile_picture_url", value: "'/default-profile.jpg'" },
        ];

        for (const update of userNullUpdates) {
          const result = await this.executeQuery(
            `UPDATE users SET ${update.column} = ${update.value} WHERE ${update.column} IS NULL`
          );
          if (result.rowCount > 0) {
            await this.log(
              "info",
              `Updated ${result.rowCount} NULL ${update.column} values`
            );
          }
        }
      }

      // Clean todos table NULL values
      if (await this.tableExists("todos")) {
        const todoNullUpdates = [
          { column: "title", value: "'Untitled Todo'" },
          { column: "description", value: "'No description'" },
          { column: "priority", value: "'medium'" },
          { column: "status", value: "'pending'" },
        ];

        for (const update of todoNullUpdates) {
          const result = await this.executeQuery(
            `UPDATE todos SET ${update.column} = ${update.value} WHERE ${update.column} IS NULL`
          );
          if (result.rowCount > 0) {
            await this.log(
              "info",
              `Updated ${result.rowCount} NULL ${update.column} values in todos`
            );
          }
        }
      }

      await this.log("info", "NULL value cleaning completed");
    } catch (error) {
      await this.log("error", "NULL value cleaning failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async handleDuplicates() {
    if (!config.cleaning.handleDuplicates) {
      await this.log("info", "Duplicate handling disabled, skipping...");
      return;
    }

    await this.log("info", "Handling duplicates...");

    try {
      // Handle duplicate usernames
      if (await this.tableExists("users")) {
        const result = await this.executeQuery(`
          UPDATE users 
          SET username = username || '_' || id
          WHERE id IN (
            SELECT u2.id
            FROM users u1
            JOIN users u2 ON u1.username = u2.username AND u1.id < u2.id
            WHERE u1.username IS NOT NULL
          )
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Handled ${result.rowCount} duplicate usernames`
          );
        }
      }

      // Handle duplicate auth_ids (keep oldest, remove others)
      if (await this.tableExists("users")) {
        const result = await this.executeQuery(`
          DELETE FROM users 
          WHERE id IN (
            SELECT u2.id
            FROM users u1
            JOIN users u2 ON u1.auth_id = u2.auth_id AND u1.id < u2.id
            WHERE u1.auth_id IS NOT NULL
          )
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Removed ${result.rowCount} duplicate auth_id records`
          );
        }
      }

      // Handle duplicate emails in auth table
      if (await this.tableExists("auth")) {
        const result = await this.executeQuery(`
          DELETE FROM auth 
          WHERE id IN (
            SELECT a2.id
            FROM auth a1
            JOIN auth a2 ON a1.email = a2.email AND a1.id < a2.id
            WHERE a1.email IS NOT NULL
          )
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Removed ${result.rowCount} duplicate email records`
          );
        }
      }

      await this.log("info", "Duplicate handling completed");
    } catch (error) {
      await this.log("error", "Duplicate handling failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async cleanOrphanedRecords() {
    if (!config.cleaning.cleanOrphans) {
      await this.log("info", "Orphaned record cleaning disabled, skipping...");
      return;
    }

    await this.log("info", "Cleaning orphaned records...");

    try {
      // Clean orphaned users (users without auth records)
      if (
        (await this.tableExists("users")) &&
        (await this.tableExists("auth"))
      ) {
        const result = await this.executeQuery(`
          DELETE FROM users 
          WHERE auth_id IS NOT NULL 
            AND auth_id NOT IN (SELECT id FROM auth)
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Removed ${result.rowCount} orphaned user records`
          );
        }
      }

      // Clean orphaned todos (todos without user records)
      if (
        (await this.tableExists("todos")) &&
        (await this.tableExists("users"))
      ) {
        const result = await this.executeQuery(`
          DELETE FROM todos 
          WHERE user_id IS NOT NULL 
            AND user_id NOT IN (SELECT id FROM users)
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Removed ${result.rowCount} orphaned todo records`
          );
        }
      }

      // Clean orphaned profile updates
      if (
        (await this.tableExists("user_profile_updates")) &&
        (await this.tableExists("users"))
      ) {
        const result = await this.executeQuery(`
          DELETE FROM user_profile_updates 
          WHERE user_id IS NOT NULL 
            AND user_id NOT IN (SELECT id FROM users)
        `);
        if (result.rowCount > 0) {
          await this.log(
            "info",
            `Removed ${result.rowCount} orphaned profile update records`
          );
        }
      }

      await this.log("info", "Orphaned record cleaning completed");
    } catch (error) {
      await this.log("error", "Orphaned record cleaning failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async optimizeIndexes() {
    if (!config.cleaning.optimizeIndexes) {
      await this.log("info", "Index optimization disabled, skipping...");
      return;
    }

    await this.log("info", "Optimizing database indexes...");

    try {
      // Create/update indexes for better performance
      const indexes = [
        // Users table indexes
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        "CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id)",
        "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at)",

        // Todos table indexes
        "CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)",
        "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority)",
        "CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date)",
        "CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_todos_user_status_priority ON todos(user_id, status, priority)",
        "CREATE INDEX IF NOT EXISTS idx_todos_user_due_date_status ON todos(user_id, due_date, status)",

        // Auth table indexes
        "CREATE INDEX IF NOT EXISTS idx_auth_email ON auth(email)",
        "CREATE INDEX IF NOT EXISTS idx_auth_created_at ON auth(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_auth_id ON auth(id)",

        // User roles and divisions indexes (for user by ID optimization)
        "CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role)",
        "CREATE INDEX IF NOT EXISTS idx_user_divisions_user_id ON user_divisions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_divisions_user_division ON user_divisions(user_id, division_name)",

        // Profile updates indexes
        "CREATE INDEX IF NOT EXISTS idx_user_profile_updates_user_id ON user_profile_updates(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_profile_updates_created_at ON user_profile_updates(created_at)",

        // User logs indexes
        "CREATE INDEX IF NOT EXISTS idx_user_logs_user_id ON user_logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_logs_action ON user_logs(action)",
        "CREATE INDEX IF NOT EXISTS idx_user_logs_created_at ON user_logs(created_at)",
      ];

      for (const indexQuery of indexes) {
        try {
          await this.executeQuery(indexQuery);
          await this.log("debug", `Index created: ${indexQuery.split(" ")[4]}`);
        } catch (error) {
          await this.log(
            "warn",
            `Failed to create index: ${indexQuery.split(" ")[4]}`,
            {
              error: error.message,
            }
          );
        }
      }

      // Analyze tables to update statistics
      const tablesToAnalyze = [
        "users",
        "auth",
        "todos",
        "user_roles",
        "user_divisions",
        "user_profile_updates",
        "user_logs",
      ];
      for (const table of tablesToAnalyze) {
        try {
          if (await this.tableExists(table)) {
            await this.executeQuery(`ANALYZE ${table}`);
            await this.log("debug", `Analyzed table: ${table}`);
          }
        } catch (error) {
          await this.log("warn", `Failed to analyze table: ${table}`, {
            error: error.message,
          });
        }
      }

      await this.log("info", "Index optimization completed");
    } catch (error) {
      await this.log("error", "Index optimization failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async vacuumDatabase() {
    if (!config.cleaning.vacuum) {
      await this.log("info", "Database vacuum disabled, skipping...");
      return;
    }

    await this.log("info", "Running database vacuum...");

    try {
      // Analyze tables for better query planning
      await this.executeQuery("ANALYZE");

      // Vacuum to reclaim storage and update statistics
      await this.executeQuery("VACUUM");

      await this.log("info", "Database vacuum completed");
    } catch (error) {
      await this.log("error", "Database vacuum failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async cleanupOldBackups() {
    if (!config.backup.enabled) {
      return;
    }

    await this.log("info", "Cleaning up old backups...");

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.backup.retention);

      // Find old backup tables
      const oldBackups = await this.executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE '%_backup_%'
        AND table_schema = 'public'
      `);

      for (const backup of oldBackups.rows) {
        const tableName = backup.table_name;
        const dateMatch = tableName.match(
          /_backup_(\d{4}_\d{2}_\d{2}T\d{2}_\d{2}_\d{2})/
        );

        if (dateMatch) {
          const backupDate = new Date(
            dateMatch[1].replace(/_/g, ":").replace("T", " ")
          );

          if (backupDate < cutoffDate) {
            await this.executeQuery(`DROP TABLE IF EXISTS ${tableName}`);
            await this.log("info", `Dropped old backup table: ${tableName}`);
          }
        }
      }

      await this.log("info", "Old backup cleanup completed");
    } catch (error) {
      await this.log("error", "Old backup cleanup failed", {
        error: error.message,
      });
    }
  }

  async generateReport() {
    const endTime = new Date();
    const duration = endTime - this.startTime;

    const report = {
      summary: {
        startTime: this.startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: `${duration}ms`,
        backupTables: this.backupTables,
        logCount: this.logs.length,
      },
      logs: this.logs,
      recommendations: [],
    };

    // Generate recommendations based on analysis
    const errorCount = this.logs.filter((log) => log.level === "error").length;
    const warnCount = this.logs.filter((log) => log.level === "warn").length;

    if (errorCount > 0) {
      report.recommendations.push(
        "Review error logs and fix issues before next run"
      );
    }

    if (warnCount > 0) {
      report.recommendations.push("Address warnings to improve data quality");
    }

    if (this.backupTables.length > 0) {
      report.recommendations.push(
        `Monitor backup tables: ${this.backupTables.join(", ")}`
      );
    }

    // Save report to file
    const reportDir = "logs";
    await fs.mkdir(reportDir, { recursive: true });

    const reportFile = path.join(
      reportDir,
      `cleanup-report-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:.-]/g, "_")}.json`
    );
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    await this.log("info", `Report generated: ${reportFile}`);
    return report;
  }

  async tableExists(tableName) {
    const result = await this.executeQuery(
      `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `,
      [tableName]
    );
    return result.rows[0].exists;
  }

  async run() {
    await this.log("info", "Starting database cleanup pipeline...");

    try {
      // Step 1: Create backup
      await this.createBackup();

      // Step 2: Analyze data quality
      const analysis = await this.analyzeDataQuality();

      // Step 3: Clean data
      await this.cleanNullValues();
      await this.handleDuplicates();
      await this.cleanOrphanedRecords();

      // Step 4: Optimize performance
      await this.optimizeIndexes();
      await this.vacuumDatabase();

      // Step 5: Cleanup old backups
      await this.cleanupOldBackups();

      // Step 6: Generate report
      const report = await this.generateReport();

      await this.log(
        "info",
        "Database cleanup pipeline completed successfully"
      );
      return { success: true, report };
    } catch (error) {
      await this.log("error", "Database cleanup pipeline failed", {
        error: error.message,
      });
      return { success: false, error: error.message };
    } finally {
      await this.pool.end();
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "run";

  const pipeline = new DatabaseCleanupPipeline();

  switch (command) {
    case "run":
      const result = await pipeline.run();
      process.exit(result.success ? 0 : 1);
      break;

    case "analyze":
      await pipeline.analyzeDataQuality();
      await pipeline.pool.end();
      break;

    case "backup":
      await pipeline.createBackup();
      await pipeline.pool.end();
      break;

    case "clean":
      await pipeline.cleanNullValues();
      await pipeline.handleDuplicates();
      await pipeline.cleanOrphanedRecords();
      await pipeline.pool.end();
      break;

    case "optimize":
      await pipeline.optimizeIndexes();
      await pipeline.vacuumDatabase();
      await pipeline.pool.end();
      break;

    default:
      console.log(`
Database Cleanup Pipeline

Usage: node database-cleanup-pipeline.js [command]

Commands:
  run       - Run complete cleanup pipeline (default)
  analyze   - Analyze data quality only
  backup    - Create backup only
  clean     - Clean data only (no backup)
  optimize  - Optimize indexes and vacuum only

Examples:
  node database-cleanup-pipeline.js run
  node database-cleanup-pipeline.js analyze
  node database-cleanup-pipeline.js clean
      `);
      process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Pipeline failed:", error);
    process.exit(1);
  });
}

module.exports = DatabaseCleanupPipeline;
