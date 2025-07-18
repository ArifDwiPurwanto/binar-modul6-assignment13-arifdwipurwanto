-- =====================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =====================================================

-- These indexes will significantly improve the users API query performance

-- 1. Composite index for user_logs to optimize action filtering and counting
CREATE INDEX IF NOT EXISTS idx_user_logs_user_id_action ON user_logs(user_id, action);

-- 2. Index on user_logs.action for faster filtering in window functions
CREATE INDEX IF NOT EXISTS idx_user_logs_action ON user_logs(action);

-- 3. Composite index for ordering and pagination
CREATE INDEX IF NOT EXISTS idx_users_created_at_id ON users(created_at DESC, id);

-- 4. Composite index for division filtering with ordering
CREATE INDEX IF NOT EXISTS idx_user_divisions_division_user_created ON user_divisions(division_name, user_id);

-- 5. Covering index for user_roles to avoid table lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON user_roles(user_id, role);

-- 6. Partial index for active users (if we frequently filter by activity)
CREATE INDEX IF NOT EXISTS idx_user_logs_active_users ON user_logs(user_id) 
-- WHERE created_at > (CURRENT_DATE - INTERVAL '30 days'); --> get an error: functions in index predicate must be marked IMMUTABLE, so replace with a fixed date
WHERE created_at > '2025-06-18';

-- =====================================================
-- QUERY PERFORMANCE ANALYSIS COMMANDS
-- =====================================================

-- Run these to analyze query performance:

-- 1. Check if indexes are being used
-- EXPLAIN (ANALYZE, BUFFERS) SELECT ... (your optimized query)

-- 2. Check index usage statistics
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- WHERE schemaname = 'public' 
-- ORDER BY idx_scan DESC;

-- 3. Check table statistics
-- SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
-- FROM pg_stat_user_tables 
-- WHERE schemaname = 'public';

-- =====================================================
-- ADDITIONAL OPTIMIZATIONS
-- =====================================================

-- Consider these for very large datasets:

-- 1. Materialized view for frequently accessed user statistics
/*
CREATE MATERIALIZED VIEW user_stats_mv AS
WITH user_stats AS (
  SELECT 
    user_id,
    COUNT(*) as log_count,
    COUNT(*) FILTER (WHERE action = 'login') as login_count,
    COUNT(*) FILTER (WHERE action = 'update_profile') as update_count
  FROM user_logs
  GROUP BY user_id
),
user_role_stats AS (
  SELECT user_id, COUNT(*) as role_count
  FROM user_roles
  GROUP BY user_id
),
user_division_stats AS (
  SELECT user_id, COUNT(*) as division_count
  FROM user_divisions
  GROUP BY user_id
)
SELECT 
  u.id as user_id,
  COALESCE(us.log_count, 0) as log_count,
  COALESCE(urs.role_count, 0) as role_count,
  COALESCE(uds.division_count, 0) as division_count,
  COALESCE(us.login_count, 0) as login_count,
  COALESCE(us.update_count, 0) as update_count
FROM users u
LEFT JOIN user_stats us ON u.id = us.user_id
LEFT JOIN user_role_stats urs ON u.id = urs.user_id
LEFT JOIN user_division_stats uds ON u.id = uds.user_id;

-- Create index on materialized view
CREATE INDEX idx_user_stats_mv_user_id ON user_stats_mv(user_id);

-- Refresh materialized view (run periodically)
-- REFRESH MATERIALIZED VIEW user_stats_mv;
*/

-- 2. Partitioning for user_logs table (if it grows very large)
/*
-- Example monthly partitioning
CREATE TABLE user_logs_y2025m01 PARTITION OF user_logs
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
*/
