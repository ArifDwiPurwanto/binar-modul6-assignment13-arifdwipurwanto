# Database Automation & ETL Pipeline System

## Overview

This project includes a comprehensive database automation and ETL (Extract, Transform, Load) pipeline system that automatically cleans, optimizes, and maintains database health. The system is designed to run automatically on code pushes and can also be executed manually.

## 🚀 Quick Start

### 1. Setup Git Hooks (Automatic Database Cleaning on Push)

```bash
# Install Git hooks for automatic database cleaning
npm run setup-hooks

# This will install:
# - pre-push hook: Runs database cleanup before every push
# - post-merge hook: Updates schema after merges
# - pre-commit hook: Basic code quality checks
```

### 2. Manual Database Operations

```bash
# Run complete database cleanup pipeline
npm run db-cleanup

# Run ETL pipeline for data transformation
npm run db-etl

# Analyze database quality
npm run db-analyze

# Create database backup
npm run db-backup

# Optimize database indexes
npm run db-optimize
```

## 🔧 Database Cleanup Pipeline

### Features

- **Automated Data Quality Checks**: Analyzes NULL values, duplicates, and orphaned records
- **Comprehensive Cleaning**: Removes NULL values, handles duplicates, cleans orphaned records
- **Performance Optimization**: Creates and optimizes database indexes
- **Backup & Rollback**: Automatic backup creation before operations
- **Detailed Logging**: Comprehensive logging with different levels
- **Report Generation**: Detailed reports with recommendations

### Usage

```bash
# Run complete cleanup pipeline
node scripts/database-cleanup-pipeline.js run

# Analyze data quality only
node scripts/database-cleanup-pipeline.js analyze

# Create backup only
node scripts/database-cleanup-pipeline.js backup

# Clean data only (no backup)
node scripts/database-cleanup-pipeline.js clean

# Optimize indexes and vacuum
node scripts/database-cleanup-pipeline.js optimize
```

### Configuration

The pipeline can be configured in the script:

```javascript
const config = {
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
```

## 🔄 ETL Pipeline

### Features

- **Data Extraction**: Extract data with incremental loading support
- **Data Transformation**: Clean and validate data according to business rules
- **Data Loading**: Upsert operations with conflict resolution
- **Data Validation**: Comprehensive validation with detailed error reporting
- **Change Detection**: Hash-based change detection for efficient processing
- **Batch Processing**: Configurable batch sizes for large datasets

### Usage

```bash
# Run complete ETL pipeline
node scripts/etl-pipeline.js run

# Extract data from specific table
node scripts/etl-pipeline.js extract users

# Transform data from specific table
node scripts/etl-pipeline.js transform todos

# Validate data from specific table
node scripts/etl-pipeline.js validate auth
```

### Data Transformation Rules

#### Users Table

- **Full Name**: Trim whitespace, limit to 100 characters
- **Username**: Convert to lowercase, remove special characters, limit to 50 characters
- **Email**: Convert to lowercase, trim whitespace
- **Phone**: Remove non-digit characters (except +), limit to 20 characters
- **Bio**: Limit to 160 characters
- **Long Bio**: Limit to 2000 characters

#### Todos Table

- **Title**: Trim whitespace, limit to 255 characters
- **Description**: Limit to 1000 characters
- **Priority**: Validate against ['low', 'medium', 'high']
- **Status**: Validate against ['pending', 'in-progress', 'completed']
- **Due Date**: Validate date format

## 🔗 Git Hooks Integration

### Pre-Push Hook

Automatically runs before every `git push`:

1. **Environment Validation**: Checks for required files and configurations
2. **Database Change Detection**: Identifies database-related file changes
3. **Backup Creation**: Creates deployment backup if needed
4. **Database Cleanup**: Runs cleanup pipeline if database changes detected
5. **Test Execution**: Runs database tests
6. **Report Generation**: Creates deployment report

### Post-Merge Hook

Automatically runs after `git merge` or `git pull`:

1. **Schema Update Detection**: Checks if database schema was updated
2. **Automatic Schema Update**: Runs schema update script if needed

### Pre-Commit Hook

Runs before every commit:

1. **Environment File Check**: Warns about .env files in commits
2. **Large File Detection**: Warns about files larger than 10MB

### Bypassing Hooks

For emergency situations, you can bypass hooks:

```bash
# Skip pre-push hook
git push --no-verify

# Skip pre-commit hook
git commit --no-verify
```

## 📊 Monitoring & Reporting

### Log Files

- `logs/database-cleanup.log` - Database cleanup operations
- `logs/etl-pipeline.log` - ETL pipeline operations
- `logs/git-hooks.log` - Git hooks execution
- `logs/cleanup-report-*.json` - Detailed cleanup reports
- `logs/etl-report-*.json` - Detailed ETL reports
- `logs/deployment-report-*.txt` - Deployment reports

### Report Structure

```json
{
  "summary": {
    "startTime": "2024-01-15T10:30:00.000Z",
    "endTime": "2024-01-15T10:35:00.000Z",
    "duration": "300000ms",
    "stats": {
      "extracted": 1000,
      "transformed": 950,
      "loaded": 900,
      "errors": 50,
      "skipped": 0
    }
  },
  "logs": [...],
  "recommendations": [
    "Review 50 data validation errors",
    "ETL success rate: 90.00%"
  ]
}
```

## 🛠️ Configuration

### Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=workshop_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_jwt_secret
```

### Git Hooks Configuration

File: `.git-hooks-config.json`

```json
{
  "database_cleanup": {
    "enabled": true,
    "auto_backup": true,
    "run_tests": true,
    "skip_on_emergency": true
  },
  "hooks": {
    "pre_push": {
      "enabled": true,
      "check_database_changes": true,
      "create_backup": true,
      "run_cleanup": true,
      "run_tests": true
    },
    "post_merge": {
      "enabled": true,
      "update_schema": true
    },
    "pre_commit": {
      "enabled": true,
      "check_env_files": true,
      "check_large_files": true
    }
  },
  "logging": {
    "level": "info",
    "file": "logs/git-hooks.log"
  }
}
```

## 📈 Performance Optimization

### Database Indexes

The system automatically creates and maintains indexes for optimal performance:

#### Users Table

- `idx_users_username` - Username lookups
- `idx_users_auth_id` - Auth relationship
- `idx_users_created_at` - Time-based queries
- `idx_users_updated_at` - Change tracking

#### Todos Table

- `idx_todos_user_id` - User-specific todos
- `idx_todos_status` - Status filtering
- `idx_todos_priority` - Priority filtering
- `idx_todos_due_date` - Due date queries
- `idx_todos_user_status_priority` - Composite index for complex queries
- `idx_todos_user_due_date_status` - Composite index for filtering

#### Auth Table

- `idx_auth_email` - Email lookups
- `idx_auth_created_at` - Time-based queries

#### Profile Updates Table

- `idx_user_profile_updates_user_id` - User-specific updates
- `idx_user_profile_updates_created_at` - Time-based queries

#### User Logs Table

- `idx_user_logs_user_id` - User-specific logs
- `idx_user_logs_action` - Action filtering
- `idx_user_logs_created_at` - Time-based queries

## 🔒 Security Features

### Data Protection

- **Input Validation**: Comprehensive validation of all data
- **SQL Injection Prevention**: Parameterized queries throughout
- **Data Sanitization**: Cleaning of user inputs
- **Backup Encryption**: Optional backup compression and encryption

### Access Control

- **User-Specific Data**: All operations respect user boundaries
- **Audit Trail**: Complete logging of all operations
- **Rollback Capability**: Automatic backup before destructive operations

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Failed

```bash
# Check environment variables
cat .env.local

# Test database connection
npm run db-analyze
```

#### Git Hooks Not Working

```bash
# Reinstall hooks
npm run setup-hooks

# Check hook permissions
ls -la .git/hooks/
```

#### ETL Pipeline Errors

```bash
# Check logs
tail -f logs/etl-pipeline.log

# Run with debug logging
NODE_ENV=debug node scripts/etl-pipeline.js run
```

#### Performance Issues

```bash
# Optimize database
npm run db-optimize

# Analyze performance
npm run db-analyze
```

### Emergency Procedures

#### Disable Automation

```bash
# Remove Git hooks
bash scripts/setup-git-hooks.sh --uninstall

# Disable in configuration
# Edit .git-hooks-config.json and set "enabled": false
```

#### Manual Rollback

```bash
# List backup tables
psql -d workshop_db -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%_backup_%';"

# Restore from backup
psql -d workshop_db -c "DROP TABLE users; CREATE TABLE users AS SELECT * FROM users_backup_20240115_103000;"
```

## 📚 API Reference

### DatabaseCleanupPipeline Class

```javascript
const DatabaseCleanupPipeline = require("./scripts/database-cleanup-pipeline.js");

const pipeline = new DatabaseCleanupPipeline();

// Run complete pipeline
const result = await pipeline.run();

// Run specific operations
await pipeline.analyzeDataQuality();
await pipeline.cleanNullValues();
await pipeline.handleDuplicates();
await pipeline.optimizeIndexes();
```

### ETLPipeline Class

```javascript
const ETLPipeline = require("./scripts/etl-pipeline.js");

const pipeline = new ETLPipeline();

// Run complete ETL
const result = await pipeline.run();

// Run specific ETL operations
await pipeline.extractData("users");
await pipeline.transformUsers(users);
await pipeline.validateData(data, "users");
await pipeline.loadData(data, "users", { upsert: true });
```

## 🤝 Contributing

### Adding New Data Transformations

1. Add transformation logic to the appropriate method in `ETLPipeline`
2. Add validation rules to `validateRecord` method
3. Update configuration for new tables
4. Add tests for new transformations

### Adding New Database Operations

1. Add operation logic to `DatabaseCleanupPipeline`
2. Update configuration options
3. Add logging and error handling
4. Create tests for new operations

### Best Practices

- Always create backups before destructive operations
- Use transactions for data consistency
- Log all operations with appropriate levels
- Validate data before processing
- Handle errors gracefully with rollback options
- Test thoroughly before deployment

## 📄 License

This database automation system is part of the workshop project and follows the same license terms.
