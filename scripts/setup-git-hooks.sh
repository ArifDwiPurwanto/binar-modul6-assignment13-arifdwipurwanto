#!/bin/bash

# Setup Git Hooks for Database Cleanup & ETL Pipeline
# This script installs the pre-push hook for automated database cleaning

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if we're in a git repository
check_git_repo() {
    if [ ! -d ".git" ]; then
        print_status $RED "❌ Not in a git repository"
        print_status $YELLOW "💡 Please run this script from the root of your git repository"
        exit 1
    fi
}

# Function to create hooks directory
create_hooks_directory() {
    local hooks_dir=".git/hooks"
    
    if [ ! -d "$hooks_dir" ]; then
        print_status $BLUE "📁 Creating hooks directory..."
        mkdir -p "$hooks_dir"
    fi
}

# Function to install pre-push hook
install_pre_push_hook() {
    local hook_source="scripts/git-hooks/pre-push"
    local hook_target=".git/hooks/pre-push"
    
    if [ ! -f "$hook_source" ]; then
        print_status $RED "❌ Pre-push hook source not found: $hook_source"
        exit 1
    fi
    
    print_status $BLUE "🔧 Installing pre-push hook..."
    
    # Copy the hook file
    cp "$hook_source" "$hook_target"
    
    # Make it executable
    chmod +x "$hook_target"
    
    print_status $GREEN "✅ Pre-push hook installed successfully"
}

# Function to create additional hooks
create_additional_hooks() {
    local hooks_dir=".git/hooks"
    
    # Create post-merge hook for database schema updates
    cat > "$hooks_dir/post-merge" << 'EOF'
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
EOF

    chmod +x "$hooks_dir/post-merge"
    print_status $GREEN "✅ Post-merge hook created"
    
    # Create pre-commit hook for basic checks
    cat > "$hooks_dir/pre-commit" << 'EOF'
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
large_files=$(git diff --cached --name-only | xargs ls -la 2>/dev/null | awk '$5 > 10485760 {print $9}' || true)
if [ -n "$large_files" ]; then
    echo "⚠️  Warning: Large files detected (>10MB):"
    echo "$large_files"
    echo "💡 Consider using git-lfs for large files"
fi

echo "✅ Pre-commit checks completed"
EOF

    chmod +x "$hooks_dir/pre-commit"
    print_status $GREEN "✅ Pre-commit hook created"
}

# Function to create configuration file
create_hook_config() {
    local config_file=".git-hooks-config.json"
    
    if [ ! -f "$config_file" ]; then
        cat > "$config_file" << 'EOF'
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
EOF
        print_status $GREEN "✅ Git hooks configuration created: $config_file"
    else
        print_status $BLUE "ℹ️  Git hooks configuration already exists"
    fi
}

# Function to create logs directory
create_logs_directory() {
    if [ ! -d "logs" ]; then
        print_status $BLUE "📁 Creating logs directory..."
        mkdir -p logs
        print_status $GREEN "✅ Logs directory created"
    fi
}

# Function to test the installation
test_installation() {
    print_status $BLUE "🧪 Testing hook installation..."
    
    local hook_target=".git/hooks/pre-push"
    
    if [ -f "$hook_target" ] && [ -x "$hook_target" ]; then
        print_status $GREEN "✅ Pre-push hook is installed and executable"
        
        # Test the hook with help flag
        if "$hook_target" --help > /dev/null 2>&1; then
            print_status $GREEN "✅ Pre-push hook is working correctly"
        else
            print_status $YELLOW "⚠️  Pre-push hook may have issues"
        fi
    else
        print_status $RED "❌ Pre-push hook installation failed"
        exit 1
    fi
}

# Function to show usage information
show_usage() {
    print_status $BLUE "📚 Git Hooks Setup Complete!"
    echo ""
    echo "The following hooks have been installed:"
    echo "  🔧 pre-push    - Database cleanup & ETL pipeline"
    echo "  🔄 post-merge  - Database schema updates"
    echo "  🔍 pre-commit  - Basic code quality checks"
    echo ""
    echo "Configuration:"
    echo "  📄 .git-hooks-config.json - Hook configuration"
    echo "  📁 logs/                   - Hook logs and reports"
    echo ""
    echo "Usage:"
    echo "  git push                    - Automatically runs cleanup pipeline"
    echo "  git push --no-verify        - Skip hooks (emergency)"
    echo "  node scripts/database-cleanup-pipeline.js --help"
    echo ""
    echo "The pre-push hook will:"
    echo "  1. Check for database-related changes"
    echo "  2. Create backup if needed"
    echo "  3. Run database cleanup pipeline"
    echo "  4. Run database tests"
    echo "  5. Generate deployment report"
    echo ""
    print_status $GREEN "🎉 Setup completed successfully!"
}

# Main execution
main() {
    print_status $BLUE "🚀 Setting up Git Hooks for Database Cleanup & ETL Pipeline"
    echo "=================================================================="
    
    # Check if we're in a git repository
    check_git_repo
    
    # Create necessary directories
    create_hooks_directory
    create_logs_directory
    
    # Install hooks
    install_pre_push_hook
    create_additional_hooks
    
    # Create configuration
    create_hook_config
    
    # Test installation
    test_installation
    
    # Show usage information
    show_usage
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Setup Git Hooks for Database Cleanup & ETL Pipeline"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo "  --uninstall   Remove installed hooks"
        echo ""
        echo "This script installs Git hooks that automatically:"
        echo "  - Run database cleanup before push"
        echo "  - Update schema after merge"
        echo "  - Check code quality before commit"
        echo ""
        echo "Requirements:"
        echo "  - Git repository"
        echo "  - Node.js (for database operations)"
        echo "  - PostgreSQL database"
        exit 0
        ;;
    --uninstall)
        print_status $YELLOW "🗑️  Uninstalling Git hooks..."
        
        if [ -f ".git/hooks/pre-push" ]; then
            rm ".git/hooks/pre-push"
            print_status $GREEN "✅ Pre-push hook removed"
        fi
        
        if [ -f ".git/hooks/post-merge" ]; then
            rm ".git/hooks/post-merge"
            print_status $GREEN "✅ Post-merge hook removed"
        fi
        
        if [ -f ".git/hooks/pre-commit" ]; then
            rm ".git/hooks/pre-commit"
            print_status $GREEN "✅ Pre-commit hook removed"
        fi
        
        print_status $GREEN "✅ Git hooks uninstalled successfully"
        exit 0
        ;;
    *)
        main
        ;;
esac 