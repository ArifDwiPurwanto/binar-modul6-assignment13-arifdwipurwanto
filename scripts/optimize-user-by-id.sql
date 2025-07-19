-- PostgreSQL Optimization Script for User by ID Query
-- This script creates indexes to ensure optimal performance for single user lookups

-- Primary index on users.id (should already exist as PRIMARY KEY)
-- CREATE INDEX IF NOT EXISTS idx_users_id ON users(id); -- Usually not needed as PRIMARY KEY

-- Index on auth.id for efficient JOIN
CREATE INDEX IF NOT EXISTS idx_auth_id ON auth(id);

-- Index on users.auth_id for efficient JOIN with auth table
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- Index on user_roles.user_id for efficient JOIN
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Index on user_divisions.user_id for efficient JOIN
CREATE INDEX IF NOT EXISTS idx_user_divisions_user_id ON user_divisions(user_id);

-- Composite indexes for better JOIN performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role);
CREATE INDEX IF NOT EXISTS idx_user_divisions_user_division ON user_divisions(user_id, division_name);

-- Index on auth.email for potential future queries
CREATE INDEX IF NOT EXISTS idx_auth_email ON auth(email);

-- Index on users.username for potential future queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE auth;
ANALYZE user_roles;
ANALYZE user_divisions;

-- Display current index usage for these tables
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'auth', 'user_roles', 'user_divisions')
ORDER BY tablename, idx_scan DESC;

-- Show query plan for the optimized query
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
  u.id,
  u.username,
  u.full_name,
  u.birth_date,
  u.bio,
  u.long_bio,
  u.profile_json,
  u.address,
  u.phone_number,
  u.created_at,
  u.updated_at,
  a.email,
  ur.role,
  ud.division_name
FROM users u
LEFT JOIN auth a ON u.auth_id = a.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN user_divisions ud ON u.id = ud.user_id
WHERE u.id = 1
LIMIT 1; 