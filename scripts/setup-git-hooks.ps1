# Setup Git Hooks for Database Cleanup & ETL Pipeline (PowerShell)
# This script installs the pre-push hook for automated database cleaning

Write-Host "🚀 Setting up Git Hooks for Database Cleanup & ETL Pipeline" -ForegroundColor Blue
Write-Host "=================================================================" -ForegroundColor Blue

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "❌ Not in a git repository" -ForegroundColor Red
    Write-Host "💡 Please run this script from the root of your git repository" -ForegroundColor Yellow
    exit 1
}

# Create hooks directory if it doesn't exist
if (-not (Test-Path ".git\hooks")) {
    Write-Host "📁 Creating hooks directory..." -ForegroundColor Blue
    New-Item -ItemType Directory -Path ".git\hooks" -Force | Out-Null
}

# Install pre-push hook
if (-not (Test-Path "scripts\git-hooks\pre-push")) {
    Write-Host "❌ Pre-push hook source not found: scripts\git-hooks\pre-push" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Installing pre-push hook..." -ForegroundColor Blue
Copy-Item "scripts\git-hooks\pre-push" ".git\hooks\pre-push" -Force
Write-Host "✅ Pre-push hook installed successfully" -ForegroundColor Green

# Create post-merge hook
Write-Host "🔄 Creating post-merge hook..." -ForegroundColor Blue
$postMergeContent = @"
#!/bin/bash

# Post-Merge Hook for Database Schema Updates
# This hook runs after git merge/pull to update database schema if needed

set -e

echo "🔄 Post-Merge Hook: Checking for database schema updates..."

# Check if database schema file was updated
if git diff HEAD@{1} HEAD --name-only | grep -q "database-schema.sql"; then
    echo "📊 Database schema updated, running schema update..."
    
    if [ -f "scripts/update-schema.js" ]; then
        if node scripts/update-schema.js; then
            echo "✅ Database schema updated successfully"
        else
            echo "⚠️  Database schema update failed, please run manually: node scripts/update-schema.js"
        fi
    else
        echo "⚠️  Schema update script not found"
    fi
else
    echo "ℹ️  No database schema changes detected"
fi
"@

Set-Content -Path ".git\hooks\post-merge" -Value $postMergeContent
Write-Host "✅ Post-merge hook created" -ForegroundColor Green

# Create pre-commit hook
Write-Host "🔍 Creating pre-commit hook..." -ForegroundColor Blue
$preCommitContent = @"
#!/bin/bash

# Pre-Commit Hook for Basic Checks
# This hook runs before commit to ensure code quality

set -e

echo "🔍 Pre-Commit Hook: Running basic checks..."

# Check for database connection in committed files
if git diff --cached --name-only | grep -q "\.env"; then
    echo "⚠️  Warning: .env files detected in commit"
    echo "💡 Consider using .env.example instead"
fi

# Check for large files
large_files=`$(git diff --cached --name-only | xargs ls -la 2>/dev/null | awk '$5 > 10485760 {print $9}' || true)
if [ -n "$large_files" ]; then
    echo "⚠️  Warning: Large files detected (>10MB):"
    echo "$large_files"
    echo "💡 Consider using git-lfs for large files"
fi

echo "✅ Pre-commit checks completed"
"@

Set-Content -Path ".git\hooks\pre-commit" -Value $preCommitContent
Write-Host "✅ Pre-commit hook created" -ForegroundColor Green

# Create configuration file
if (-not (Test-Path ".git-hooks-config.json")) {
    Write-Host "📄 Creating Git hooks configuration..." -ForegroundColor Blue
    $configContent = @"
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
"@
    Set-Content -Path ".git-hooks-config.json" -Value $configContent
    Write-Host "✅ Git hooks configuration created: .git-hooks-config.json" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Git hooks configuration already exists" -ForegroundColor Blue
}

# Create logs directory
if (-not (Test-Path "logs")) {
    Write-Host "📁 Creating logs directory..." -ForegroundColor Blue
    New-Item -ItemType Directory -Path "logs" -Force | Out-Null
    Write-Host "✅ Logs directory created" -ForegroundColor Green
}

# Test installation
Write-Host "🧪 Testing hook installation..." -ForegroundColor Blue
if (Test-Path ".git\hooks\pre-push") {
    Write-Host "✅ Pre-push hook is installed" -ForegroundColor Green
} else {
    Write-Host "❌ Pre-push hook installation failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "📚 Git Hooks Setup Complete!" -ForegroundColor Blue
Write-Host ""
Write-Host "The following hooks have been installed:" -ForegroundColor White
Write-Host "  🔧 pre-push    - Database cleanup & ETL pipeline" -ForegroundColor White
Write-Host "  🔄 post-merge  - Database schema updates" -ForegroundColor White
Write-Host "  🔍 pre-commit  - Basic code quality checks" -ForegroundColor White
Write-Host ""
Write-Host "Configuration:" -ForegroundColor White
Write-Host "  📄 .git-hooks-config.json - Hook configuration" -ForegroundColor White
Write-Host "  📁 logs/                   - Hook logs and reports" -ForegroundColor White
Write-Host ""
Write-Host "Usage:" -ForegroundColor White
Write-Host "  git push                    - Automatically runs cleanup pipeline" -ForegroundColor White
Write-Host "  git push --no-verify        - Skip hooks (emergency)" -ForegroundColor White
Write-Host "  node scripts/database-cleanup-pipeline.js --help" -ForegroundColor White
Write-Host ""
Write-Host "The pre-push hook will:" -ForegroundColor White
Write-Host "  1. Check for database-related changes" -ForegroundColor White
Write-Host "  2. Create backup if needed" -ForegroundColor White
Write-Host "  3. Run database cleanup pipeline" -ForegroundColor White
Write-Host "  4. Run database tests" -ForegroundColor White
Write-Host "  5. Generate deployment report" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Setup completed successfully!" -ForegroundColor Green 