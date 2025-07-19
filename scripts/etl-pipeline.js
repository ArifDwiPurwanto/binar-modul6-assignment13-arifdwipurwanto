#!/usr/bin/env node

/**
 * ETL Pipeline for Data Transformation & Migration
 *
 * This script provides comprehensive ETL (Extract, Transform, Load) operations
 * for data transformation, migration, and quality improvement.
 *
 * Features:
 * - Data extraction from multiple sources
 * - Data transformation and cleaning
 * - Data validation and quality checks
 * - Incremental loading with conflict resolution
 * - Performance optimization
 * - Comprehensive logging and monitoring
 * - Rollback capabilities
 */

const { Pool } = require("pg");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
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
  etl: {
    batchSize: 1000,
    maxRetries: 3,
    timeout: 30000, // 30 seconds
    validateData: true,
    createBackup: true,
    incremental: true,
  },
  logging: {
    level: "info",
    file: "logs/etl-pipeline.log",
  },
};

class ETLPipeline {
  constructor() {
    this.pool = new Pool(config.database);
    this.logs = [];
    this.startTime = new Date();
    this.stats = {
      extracted: 0,
      transformed: 0,
      loaded: 0,
      errors: 0,
      skipped: 0,
    };
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
    if (!config.etl.createBackup) {
      await this.log("info", "Backup disabled, skipping...");
      return;
    }

    await this.log("info", "Creating ETL backup...");

    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.-]/g, "_")
        .slice(0, 19);
      const backupTables = [
        "users",
        "auth",
        "todos",
        "user_profile_updates",
        "user_logs",
      ];

      for (const table of backupTables) {
        const backupTableName = `${table}_etl_backup_${timestamp}`;

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
          await this.log("info", `ETL backup created: ${backupTableName}`);
        }
      }
    } catch (error) {
      await this.log("error", "ETL backup creation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async extractData(tableName, conditions = {}) {
    await this.log("info", `Extracting data from ${tableName}...`);

    try {
      let query = `SELECT * FROM ${tableName}`;
      const params = [];
      let paramIndex = 1;

      // Add conditions for incremental loading
      if (config.etl.incremental && conditions.updatedAfter) {
        query += ` WHERE updated_at > $${paramIndex}`;
        params.push(conditions.updatedAfter);
        paramIndex++;
      }

      if (conditions.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(conditions.limit);
      }

      const result = await this.executeQuery(query, params);
      this.stats.extracted += result.rows.length;

      await this.log(
        "info",
        `Extracted ${result.rows.length} records from ${tableName}`
      );
      return result.rows;
    } catch (error) {
      await this.log("error", `Data extraction failed for ${tableName}`, {
        error: error.message,
      });
      throw error;
    }
  }

  async transformUsers(users) {
    await this.log("info", "Transforming users data...");

    try {
      const transformed = users.map((user) => {
        const transformed = { ...user };

        // Clean and validate full_name
        if (transformed.full_name) {
          transformed.full_name = transformed.full_name.trim();
          if (transformed.full_name.length > 100) {
            transformed.full_name = transformed.full_name.substring(0, 100);
          }
        }

        // Clean and validate username
        if (transformed.username) {
          transformed.username = transformed.username.toLowerCase().trim();
          // Remove special characters except hyphens and underscores
          transformed.username = transformed.username.replace(
            /[^a-z0-9_-]/g,
            ""
          );
          if (transformed.username.length > 50) {
            transformed.username = transformed.username.substring(0, 50);
          }
        }

        // Clean and validate email (if present in profile_json)
        if (
          transformed.profile_json &&
          typeof transformed.profile_json === "object"
        ) {
          if (transformed.profile_json.email) {
            transformed.profile_json.email = transformed.profile_json.email
              .toLowerCase()
              .trim();
          }
        }

        // Clean and validate phone number
        if (transformed.phone_number) {
          // Remove all non-digit characters except + at the beginning
          transformed.phone_number = transformed.phone_number.replace(
            /[^\d+]/g,
            ""
          );
          if (transformed.phone_number.length > 20) {
            transformed.phone_number = transformed.phone_number.substring(
              0,
              20
            );
          }
        }

        // Clean and validate bio
        if (transformed.bio && transformed.bio.length > 160) {
          transformed.bio = transformed.bio.substring(0, 160);
        }

        // Clean and validate long_bio
        if (transformed.long_bio && transformed.long_bio.length > 2000) {
          transformed.long_bio = transformed.long_bio.substring(0, 2000);
        }

        // Generate hash for change detection
        transformed.data_hash = this.generateDataHash(transformed);

        return transformed;
      });

      this.stats.transformed += transformed.length;
      await this.log("info", `Transformed ${transformed.length} user records`);
      return transformed;
    } catch (error) {
      await this.log("error", "User data transformation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async transformTodos(todos) {
    await this.log("info", "Transforming todos data...");

    try {
      const transformed = todos.map((todo) => {
        const transformed = { ...todo };

        // Clean and validate title
        if (transformed.title) {
          transformed.title = transformed.title.trim();
          if (transformed.title.length > 255) {
            transformed.title = transformed.title.substring(0, 255);
          }
        }

        // Clean and validate description
        if (transformed.description && transformed.description.length > 1000) {
          transformed.description = transformed.description.substring(0, 1000);
        }

        // Validate priority
        if (
          transformed.priority &&
          !["low", "medium", "high"].includes(transformed.priority)
        ) {
          transformed.priority = "medium";
        }

        // Validate status
        if (
          transformed.status &&
          !["pending", "in-progress", "completed"].includes(transformed.status)
        ) {
          transformed.status = "pending";
        }

        // Validate due_date
        if (transformed.due_date) {
          const dueDate = new Date(transformed.due_date);
          if (isNaN(dueDate.getTime())) {
            transformed.due_date = null;
          }
        }

        // Generate hash for change detection
        transformed.data_hash = this.generateDataHash(transformed);

        return transformed;
      });

      this.stats.transformed += transformed.length;
      await this.log("info", `Transformed ${transformed.length} todo records`);
      return transformed;
    } catch (error) {
      await this.log("error", "Todo data transformation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  async validateData(data, tableName) {
    if (!config.etl.validateData) {
      return data;
    }

    await this.log(
      "info",
      `Validating ${data.length} records for ${tableName}...`
    );

    try {
      const validData = [];
      const invalidData = [];

      for (const record of data) {
        const validation = this.validateRecord(record, tableName);

        if (validation.isValid) {
          validData.push(record);
        } else {
          invalidData.push({
            record,
            errors: validation.errors,
          });
          this.stats.errors++;
        }
      }

      if (invalidData.length > 0) {
        await this.log(
          "warn",
          `Found ${invalidData.length} invalid records in ${tableName}`,
          {
            sampleErrors: invalidData.slice(0, 3),
          }
        );
      }

      await this.log(
        "info",
        `Validation completed: ${validData.length} valid, ${invalidData.length} invalid`
      );
      return validData;
    } catch (error) {
      await this.log("error", "Data validation failed", {
        error: error.message,
      });
      throw error;
    }
  }

  validateRecord(record, tableName) {
    const errors = [];

    switch (tableName) {
      case "users":
        if (!record.username || record.username.length < 3) {
          errors.push("Username must be at least 3 characters");
        }
        if (record.full_name && record.full_name.length > 100) {
          errors.push("Full name too long");
        }
        if (
          record.phone_number &&
          !/^\+?[\d\s\-\(\)]+$/.test(record.phone_number)
        ) {
          errors.push("Invalid phone number format");
        }
        break;

      case "todos":
        if (!record.title || record.title.trim().length === 0) {
          errors.push("Title is required");
        }
        if (record.title && record.title.length > 255) {
          errors.push("Title too long");
        }
        if (
          record.priority &&
          !["low", "medium", "high"].includes(record.priority)
        ) {
          errors.push("Invalid priority value");
        }
        if (
          record.status &&
          !["pending", "in-progress", "completed"].includes(record.status)
        ) {
          errors.push("Invalid status value");
        }
        break;

      case "auth":
        if (!record.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
          errors.push("Invalid email format");
        }
        if (!record.password || record.password.length < 6) {
          errors.push("Password too short");
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  generateDataHash(data) {
    // Create a hash of the data for change detection
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash("md5").update(dataString).digest("hex");
  }

  async loadData(data, tableName, options = {}) {
    await this.log(
      "info",
      `Loading ${data.length} records into ${tableName}...`
    );

    try {
      const client = await this.pool.connect();
      let loadedCount = 0;
      let skippedCount = 0;

      try {
        await client.query("BEGIN");

        for (const record of data) {
          try {
            if (options.upsert) {
              // Use UPSERT (INSERT ... ON CONFLICT)
              const columns = Object.keys(record).filter(
                (key) => key !== "data_hash"
              );
              const values = columns.map((_, index) => `$${index + 1}`);
              const conflictColumns = options.conflictColumns || ["id"];
              const updateColumns = columns.filter(
                (col) => !conflictColumns.includes(col)
              );

              const updateSet = updateColumns
                .map((col, index) => `${col} = $${columns.length + index + 1}`)
                .join(", ");

              const query = `
                INSERT INTO ${tableName} (${columns.join(", ")})
                VALUES (${values.join(", ")})
                ON CONFLICT (${conflictColumns.join(", ")})
                DO UPDATE SET ${updateSet}
              `;

              const allValues = [
                ...columns.map((col) => record[col]),
                ...updateColumns.map((col) => record[col]),
              ];

              await client.query(query, allValues);
            } else {
              // Simple INSERT
              const columns = Object.keys(record).filter(
                (key) => key !== "data_hash"
              );
              const values = columns.map((_, index) => `$${index + 1}`);

              const query = `
                INSERT INTO ${tableName} (${columns.join(", ")})
                VALUES (${values.join(", ")})
              `;

              await client.query(
                query,
                columns.map((col) => record[col])
              );
            }

            loadedCount++;
          } catch (error) {
            if (error.code === "23505") {
              // Unique constraint violation
              skippedCount++;
              this.stats.skipped++;
            } else {
              throw error;
            }
          }
        }

        await client.query("COMMIT");

        this.stats.loaded += loadedCount;
        await this.log(
          "info",
          `Loaded ${loadedCount} records, skipped ${skippedCount} duplicates`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      await this.log("error", `Data loading failed for ${tableName}`, {
        error: error.message,
      });
      throw error;
    }
  }

  async runETLForTable(tableName, options = {}) {
    await this.log("info", `Starting ETL pipeline for ${tableName}...`);

    try {
      // Step 1: Extract
      const extractedData = await this.extractData(
        tableName,
        options.extractConditions
      );

      if (extractedData.length === 0) {
        await this.log("info", `No data to process for ${tableName}`);
        return;
      }

      // Step 2: Transform
      let transformedData;
      switch (tableName) {
        case "users":
          transformedData = await this.transformUsers(extractedData);
          break;
        case "todos":
          transformedData = await this.transformTodos(extractedData);
          break;
        default:
          transformedData = extractedData;
      }

      // Step 3: Validate
      const validData = await this.validateData(transformedData, tableName);

      // Step 4: Load
      if (validData.length > 0) {
        await this.loadData(validData, tableName, options.loadOptions);
      }

      await this.log("info", `ETL pipeline completed for ${tableName}`);
    } catch (error) {
      await this.log("error", `ETL pipeline failed for ${tableName}`, {
        error: error.message,
      });
      throw error;
    }
  }

  async runFullETL() {
    await this.log("info", "Starting full ETL pipeline...");

    try {
      // Create backup
      await this.createBackup();

      // Define ETL jobs
      const etlJobs = [
        {
          table: "users",
          extractConditions: {
            limit: config.etl.batchSize,
          },
          loadOptions: {
            upsert: true,
            conflictColumns: ["id"],
          },
        },
        {
          table: "todos",
          extractConditions: {
            limit: config.etl.batchSize,
          },
          loadOptions: {
            upsert: true,
            conflictColumns: ["id"],
          },
        },
        {
          table: "auth",
          extractConditions: {
            limit: config.etl.batchSize,
          },
          loadOptions: {
            upsert: true,
            conflictColumns: ["id"],
          },
        },
      ];

      // Run ETL for each table
      for (const job of etlJobs) {
        await this.runETLForTable(job.table, job);
      }

      await this.log("info", "Full ETL pipeline completed successfully");
    } catch (error) {
      await this.log("error", "Full ETL pipeline failed", {
        error: error.message,
      });
      throw error;
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
        stats: this.stats,
      },
      logs: this.logs,
      recommendations: [],
    };

    // Generate recommendations
    if (this.stats.errors > 0) {
      report.recommendations.push(
        `Review ${this.stats.errors} data validation errors`
      );
    }

    if (this.stats.skipped > 0) {
      report.recommendations.push(
        `Investigate ${this.stats.skipped} skipped records (duplicates)`
      );
    }

    if (this.stats.extracted > 0) {
      const successRate = (
        (this.stats.loaded / this.stats.extracted) *
        100
      ).toFixed(2);
      report.recommendations.push(`ETL success rate: ${successRate}%`);
    }

    // Save report
    const reportDir = "logs";
    await fs.mkdir(reportDir, { recursive: true });

    const reportFile = path.join(
      reportDir,
      `etl-report-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:.-]/g, "_")}.json`
    );
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    await this.log("info", `ETL report generated: ${reportFile}`);
    return report;
  }

  async run() {
    await this.log("info", "Starting ETL pipeline...");

    try {
      await this.runFullETL();
      const report = await this.generateReport();

      await this.log("info", "ETL pipeline completed successfully");
      return { success: true, report };
    } catch (error) {
      await this.log("error", "ETL pipeline failed", { error: error.message });
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

  const pipeline = new ETLPipeline();

  switch (command) {
    case "run":
      const result = await pipeline.run();
      process.exit(result.success ? 0 : 1);
      break;

    case "extract":
      const tableName = args[1] || "users";
      const data = await pipeline.extractData(tableName);
      console.log(JSON.stringify(data, null, 2));
      await pipeline.pool.end();
      break;

    case "transform":
      const tableName2 = args[1] || "users";
      const extractData = await pipeline.extractData(tableName2);
      let transformedData;

      switch (tableName2) {
        case "users":
          transformedData = await pipeline.transformUsers(extractData);
          break;
        case "todos":
          transformedData = await pipeline.transformTodos(extractData);
          break;
        default:
          transformedData = extractData;
      }

      console.log(JSON.stringify(transformedData, null, 2));
      await pipeline.pool.end();
      break;

    case "validate":
      const tableName3 = args[1] || "users";
      const extractData2 = await pipeline.extractData(tableName3);
      const validData = await pipeline.validateData(extractData2, tableName3);
      console.log(`Valid records: ${validData.length}/${extractData2.length}`);
      await pipeline.pool.end();
      break;

    default:
      console.log(`
ETL Pipeline for Data Transformation & Migration

Usage: node etl-pipeline.js [command] [options]

Commands:
  run                    - Run complete ETL pipeline (default)
  extract [table]        - Extract data from specified table
  transform [table]      - Transform data from specified table
  validate [table]       - Validate data from specified table

Examples:
  node etl-pipeline.js run
  node etl-pipeline.js extract users
  node etl-pipeline.js transform todos
  node etl-pipeline.js validate auth

Features:
  - Data extraction with incremental loading
  - Data transformation and cleaning
  - Data validation and quality checks
  - Upsert operations with conflict resolution
  - Comprehensive logging and reporting
  - Backup creation before processing
      `);
      process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ ETL pipeline failed:", error);
    process.exit(1);
  });
}

module.exports = ETLPipeline;
