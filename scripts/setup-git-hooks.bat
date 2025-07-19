@echo off
REM Setup Git Hooks for Database Cleanup & ETL Pipeline (Windows)
REM This script installs the pre-push hook for automated database cleaning

echo 🚀 Setting up Git Hooks for Database Cleanup ^& ETL Pipeline
echo ==================================================================

REM Check if we're in a git repository
if not exist ".git" (
    echo ❌ Not in a git repository
    echo 💡 Please run this script from the root of your git repository
    exit /b 1
)

REM Create hooks directory if it doesn't exist
if not exist ".git\hooks" (
    echo 📁 Creating hooks directory...
    mkdir ".git\hooks"
)

REM Install pre-push hook
if not exist "scripts\git-hooks\pre-push" (
    echo ❌ Pre-push hook source not found: scripts\git-hooks\pre-push
    exit /b 1
)

echo 🔧 Installing pre-push hook...
copy "scripts\git-hooks\pre-push" ".git\hooks\pre-push" >nul
echo ✅ Pre-push hook installed successfully

REM Create post-merge hook
echo 🔄 Creating post-merge hook...
(
echo #!/bin/bash
echo.
echo # Post-Merge Hook for Database Schema Updates
echo # This hook runs after git merge/pull to update database schema if needed
echo.
echo set -e
echo.
echo echo "🔄 Post-Merge Hook: Checking for database schema updates..."
echo.
echo # Check if database schema file was updated
echo if git diff HEAD@{1} HEAD --name-only ^| grep -q "database-schema.sql"; then
echo     echo "📊 Database schema updated, running schema update..."
echo.    
echo     if [ -f "scripts/update-schema.js" ]; then
echo         if node scripts/update-schema.js; then
echo             echo "✅ Database schema updated successfully"
echo         else
echo             echo "⚠️  Database schema update failed, please run manually: node scripts/update-schema.js"
echo         fi
echo     else
echo         echo "⚠️  Schema update script not found"
echo     fi
echo else
echo     echo "ℹ️  No database schema changes detected"
echo fi
) > ".git\hooks\post-merge"

echo ✅ Post-merge hook created

REM Create pre-commit hook
echo 🔍 Creating pre-commit hook...
(
echo #!/bin/bash
echo.
echo # Pre-Commit Hook for Basic Checks
echo # This hook runs before commit to ensure code quality
echo.
echo set -e
echo.
echo echo "🔍 Pre-Commit Hook: Running basic checks..."
echo.
echo # Check for database connection in committed files
echo if git diff --cached --name-only ^| grep -q "\.env"; then
echo     echo "⚠️  Warning: .env files detected in commit"
echo     echo "💡 Consider using .env.example instead"
echo fi
echo.
echo # Check for large files
echo large_files=^$(git diff --cached --name-only ^| xargs ls -la 2^>^/dev/null ^| awk '$5 ^> 10485760 {print $9}' ^|^| true^)
echo if [ -n "$large_files" ]; then
echo     echo "⚠️  Warning: Large files detected (^>10MB^):"
echo     echo "$large_files"
echo     echo "💡 Consider using git-lfs for large files"
echo fi
echo.
echo echo "✅ Pre-commit checks completed"
) > ".git\hooks\pre-commit"

echo ✅ Pre-commit hook created

REM Create configuration file
if not exist ".git-hooks-config.json" (
    echo 📄 Creating Git hooks configuration...
    (
    echo {
    echo   "database_cleanup": {
    echo     "enabled": true,
    echo     "auto_backup": true,
    echo     "run_tests": true,
    echo     "skip_on_emergency": true
    echo   },
    echo   "hooks": {
    echo     "pre_push": {
    echo       "enabled": true,
    echo       "check_database_changes": true,
    echo       "create_backup": true,
    echo       "run_cleanup": true,
    echo       "run_tests": true
    echo     },
    echo     "post_merge": {
    echo       "enabled": true,
    echo       "update_schema": true
    echo     },
    echo     "pre_commit": {
    echo       "enabled": true,
    echo       "check_env_files": true,
    echo       "check_large_files": true
    echo     }
    echo   },
    echo   "logging": {
    echo     "level": "info",
    echo     "file": "logs/git-hooks.log"
    echo   }
    echo }
    ) > ".git-hooks-config.json"
    echo ✅ Git hooks configuration created: .git-hooks-config.json
) else (
    echo ℹ️  Git hooks configuration already exists
)

REM Create logs directory
if not exist "logs" (
    echo 📁 Creating logs directory...
    mkdir logs
    echo ✅ Logs directory created
)

REM Test installation
echo 🧪 Testing hook installation...
if exist ".git\hooks\pre-push" (
    echo ✅ Pre-push hook is installed
) else (
    echo ❌ Pre-push hook installation failed
    exit /b 1
)

echo.
echo 📚 Git Hooks Setup Complete!
echo.
echo The following hooks have been installed:
echo   🔧 pre-push    - Database cleanup ^& ETL pipeline
echo   🔄 post-merge  - Database schema updates
echo   🔍 pre-commit  - Basic code quality checks
echo.
echo Configuration:
echo   📄 .git-hooks-config.json - Hook configuration
echo   📁 logs/                   - Hook logs and reports
echo.
echo Usage:
echo   git push                    - Automatically runs cleanup pipeline
echo   git push --no-verify        - Skip hooks (emergency)
echo   node scripts/database-cleanup-pipeline.js --help
echo.
echo The pre-push hook will:
echo   1. Check for database-related changes
echo   2. Create backup if needed
echo   3. Run database cleanup pipeline
echo   4. Run database tests
echo   5. Generate deployment report
echo.
echo 🎉 Setup completed successfully! 