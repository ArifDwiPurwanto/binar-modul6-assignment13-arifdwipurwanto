-- =====================================================
-- USERS TABLE DATA CLEANING SCRIPT
-- =====================================================
-- This script cleans NULL values and duplicate rows in the users table
-- Run this script carefully as it modifies data

-- =====================================================
-- STEP 1: BACKUP CURRENT DATA (SAFETY FIRST)
-- =====================================================

-- Create backup table with timestamp
CREATE TABLE IF NOT EXISTS users_backup_$(date +%Y%m%d_%H%M%S) AS 
SELECT * FROM users;

-- Log backup creation
DO $$
BEGIN
    RAISE NOTICE 'Backup created: users_backup_$(date +%Y%m%d_%H%M%S)';
END $$;

-- =====================================================
-- STEP 2: ANALYZE CURRENT DATA STATE
-- =====================================================

-- Count total users
SELECT COUNT(*) as total_users FROM users;

-- Count users with NULL values in each column
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
    'auth_id' as column_name,
    COUNT(*) as null_count
FROM users 
WHERE auth_id IS NULL
UNION ALL
SELECT 
    'birth_date' as column_name,
    COUNT(*) as null_count
FROM users 
WHERE birth_date IS NULL
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
WHERE phone_number IS NULL;

-- Find duplicate usernames
SELECT 
    username,
    COUNT(*) as duplicate_count,
    array_agg(id) as user_ids
FROM users 
WHERE username IS NOT NULL
GROUP BY username 
HAVING COUNT(*) > 1;

-- Find duplicate auth_ids
SELECT 
    auth_id,
    COUNT(*) as duplicate_count,
    array_agg(id) as user_ids
FROM users 
WHERE auth_id IS NOT NULL
GROUP BY auth_id 
HAVING COUNT(*) > 1;

-- Find completely duplicate rows (all columns same)
WITH duplicate_rows AS (
    SELECT 
        full_name, username, auth_id, birth_date, bio, long_bio, 
        profile_json, address, phone_number, created_at, updated_at,
        COUNT(*) as row_count,
        array_agg(id) as user_ids
    FROM users
    GROUP BY full_name, username, auth_id, birth_date, bio, long_bio, 
             profile_json, address, phone_number, created_at, updated_at
    HAVING COUNT(*) > 1
)
SELECT * FROM duplicate_rows;

-- =====================================================
-- STEP 3: CLEAN NULL VALUES
-- =====================================================

-- Update NULL full_names with default values
UPDATE users 
SET full_name = 'Unknown User'
WHERE full_name IS NULL;

-- Update NULL usernames with generated usernames
UPDATE users 
SET username = 'user_' || id
WHERE username IS NULL;

-- Update NULL bios with default message
UPDATE users 
SET bio = 'No bio available'
WHERE bio IS NULL;

-- Update NULL addresses with default
UPDATE users 
SET address = 'Address not provided'
WHERE address IS NULL;

-- Update NULL phone numbers with default
UPDATE users 
SET phone_number = 'No phone provided'
WHERE phone_number IS NULL;

-- Update NULL profile_json with empty object
UPDATE users 
SET profile_json = '{}'
WHERE profile_json IS NULL;

-- Log NULL value updates
DO $$
BEGIN
    RAISE NOTICE 'NULL values cleaned in users table';
END $$;

-- =====================================================
-- STEP 4: HANDLE DUPLICATE USERNAMES
-- =====================================================

-- Create temporary table to track username duplicates
CREATE TEMP TABLE username_duplicates AS
SELECT 
    username,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at) as user_ids
FROM users 
WHERE username IS NOT NULL
GROUP BY username 
HAVING COUNT(*) > 1;

-- Update duplicate usernames (keep the oldest, update others)
UPDATE users 
SET username = username || '_' || id
WHERE id IN (
    SELECT unnest(user_ids[2:array_length(user_ids, 1)]) 
    FROM username_duplicates
);

-- Log username duplicate handling
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count FROM username_duplicates;
    RAISE NOTICE 'Handled % duplicate username(s)', duplicate_count;
END $$;

-- =====================================================
-- STEP 5: HANDLE DUPLICATE AUTH_IDS
-- =====================================================

-- Create temporary table to track auth_id duplicates
CREATE TEMP TABLE auth_duplicates AS
SELECT 
    auth_id,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at) as user_ids
FROM users 
WHERE auth_id IS NOT NULL
GROUP BY auth_id 
HAVING COUNT(*) > 1;

-- For auth_id duplicates, we need to be more careful
-- Keep the oldest user record, remove others
DELETE FROM users 
WHERE id IN (
    SELECT unnest(user_ids[2:array_length(user_ids, 1)]) 
    FROM auth_duplicates
);

-- Log auth_id duplicate handling
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count FROM auth_duplicates;
    RAISE NOTICE 'Handled % duplicate auth_id(s)', duplicate_count;
END $$;

-- =====================================================
-- STEP 6: REMOVE COMPLETELY DUPLICATE ROWS
-- =====================================================

-- Remove completely duplicate rows (keep the one with lowest ID)
DELETE FROM users 
WHERE id NOT IN (
    SELECT MIN(id)
    FROM users
    GROUP BY full_name, username, auth_id, birth_date, bio, long_bio, 
             profile_json, address, phone_number, created_at, updated_at
);

-- Log duplicate row removal
DO $$
BEGIN
    RAISE NOTICE 'Removed completely duplicate rows';
END $$;

-- =====================================================
-- STEP 7: CLEAN ORPHANED RECORDS
-- =====================================================

-- Remove users without valid auth_id (orphaned records)
DELETE FROM users 
WHERE auth_id IS NOT NULL 
  AND auth_id NOT IN (SELECT id FROM auth);

-- Log orphaned record cleanup
DO $$
BEGIN
    RAISE NOTICE 'Cleaned orphaned user records';
END $$;

-- =====================================================
-- STEP 8: VALIDATE DATA INTEGRITY
-- =====================================================

-- Check for remaining NULL values in required fields
SELECT 
    'full_name' as column_name,
    COUNT(*) as remaining_nulls
FROM users 
WHERE full_name IS NULL
UNION ALL
SELECT 
    'username' as column_name,
    COUNT(*) as remaining_nulls
FROM users 
WHERE username IS NULL;

-- Check for remaining duplicates
SELECT 
    username,
    COUNT(*) as remaining_duplicates
FROM users 
GROUP BY username 
HAVING COUNT(*) > 1;

-- Check for orphaned records
SELECT COUNT(*) as orphaned_users
FROM users u
LEFT JOIN auth a ON u.auth_id = a.id
WHERE u.auth_id IS NOT NULL AND a.id IS NULL;

-- =====================================================
-- STEP 9: UPDATE SEQUENCES
-- =====================================================

-- Reset sequences to avoid conflicts
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- =====================================================
-- STEP 10: FINAL SUMMARY
-- =====================================================

-- Show final user count
SELECT COUNT(*) as final_user_count FROM users;

-- Show data quality summary
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN full_name IS NOT NULL THEN 1 END) as users_with_name,
    COUNT(CASE WHEN username IS NOT NULL THEN 1 END) as users_with_username,
    COUNT(CASE WHEN bio IS NOT NULL THEN 1 END) as users_with_bio,
    COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as users_with_address,
    COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as users_with_phone,
    COUNT(CASE WHEN profile_json IS NOT NULL THEN 1 END) as users_with_profile
FROM users;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Users table cleaning completed successfully!';
    RAISE NOTICE 'Check the backup table if you need to restore any data.';
END $$;

-- =====================================================
-- ROLLBACK INSTRUCTIONS (IF NEEDED)
-- =====================================================

/*
To rollback changes (if needed):

1. Drop the cleaned users table:
   DROP TABLE users;

2. Restore from backup:
   ALTER TABLE users_backup_YYYYMMDD_HHMMSS RENAME TO users;

3. Reset sequences:
   SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
*/ 