-- =====================================================
-- ETL DATA CLEANING SCRIPT FOR USERS TABLE
-- =====================================================
-- This script performs comprehensive data cleaning on the users table
-- Handles NULL values, duplicates, and data integrity issues
-- Designed to be run as part of CI/CD pipeline

-- =====================================================
-- CONFIGURATION
-- =====================================================

-- Set transaction isolation level for consistency
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Enable logging
SET log_statement = 'all';
SET log_min_duration_statement = 0;

-- =====================================================
-- STEP 1: CREATE BACKUP (SAFETY FIRST)
-- =====================================================

DO $$
DECLARE
    backup_table_name TEXT;
    timestamp_str TEXT;
BEGIN
    -- Generate timestamp for backup table name
    timestamp_str := to_char(now(), 'YYYYMMDD_HH24MISS');
    backup_table_name := 'users_backup_' || timestamp_str;
    
    -- Create backup table
    EXECUTE format('CREATE TABLE %I AS SELECT * FROM users', backup_table_name);
    
    -- Log backup creation
    RAISE NOTICE 'Backup created: %', backup_table_name;
    
    -- Store backup table name in a temporary table for reference
    CREATE TEMP TABLE backup_info (table_name TEXT);
    INSERT INTO backup_info VALUES (backup_table_name);
END $$;

-- =====================================================
-- STEP 2: ANALYZE DATA QUALITY (BEFORE CLEANING)
-- =====================================================

-- Create analysis table
CREATE TEMP TABLE data_quality_analysis AS
SELECT 
    'before_cleaning' as phase,
    COUNT(*) as total_users,
    COUNT(CASE WHEN full_name IS NULL THEN 1 END) as null_full_names,
    COUNT(CASE WHEN username IS NULL THEN 1 END) as null_usernames,
    COUNT(CASE WHEN bio IS NULL THEN 1 END) as null_bios,
    COUNT(CASE WHEN address IS NULL THEN 1 END) as null_addresses,
    COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as null_phones,
    COUNT(CASE WHEN profile_json IS NULL THEN 1 END) as null_profiles,
    COUNT(CASE WHEN auth_id IS NULL THEN 1 END) as null_auth_ids,
    (SELECT COUNT(*) FROM (
        SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING COUNT(*) > 1
    ) t) as duplicate_usernames,
    (SELECT COUNT(*) FROM (
        SELECT auth_id FROM users WHERE auth_id IS NOT NULL GROUP BY auth_id HAVING COUNT(*) > 1
    ) t) as duplicate_auth_ids,
    (SELECT COUNT(*) FROM users WHERE auth_id IS NOT NULL AND auth_id NOT IN (SELECT id FROM auth)) as orphaned_users
FROM users;

-- Log analysis results
DO $$
DECLARE
    analysis RECORD;
BEGIN
    SELECT * INTO analysis FROM data_quality_analysis;
    RAISE NOTICE 'Data Quality Analysis (Before):';
    RAISE NOTICE '  Total users: %', analysis.total_users;
    RAISE NOTICE '  NULL full_names: %', analysis.null_full_names;
    RAISE NOTICE '  NULL usernames: %', analysis.null_usernames;
    RAISE NOTICE '  NULL bios: %', analysis.null_bios;
    RAISE NOTICE '  NULL addresses: %', analysis.null_addresses;
    RAISE NOTICE '  NULL phones: %', analysis.null_phones;
    RAISE NOTICE '  NULL profiles: %', analysis.null_profiles;
    RAISE NOTICE '  NULL auth_ids: %', analysis.null_auth_ids;
    RAISE NOTICE '  Duplicate usernames: %', analysis.duplicate_usernames;
    RAISE NOTICE '  Duplicate auth_ids: %', analysis.duplicate_auth_ids;
    RAISE NOTICE '  Orphaned users: %', analysis.orphaned_users;
END $$;

-- =====================================================
-- STEP 3: CLEAN NULL VALUES
-- =====================================================

-- Update NULL full_names with meaningful defaults
UPDATE users 
SET 
    full_name = CASE 
        WHEN username IS NOT NULL THEN 'User ' || username
        ELSE 'Unknown User ' || id
    END
WHERE full_name IS NULL;

-- Update NULL usernames with generated usernames
UPDATE users 
SET username = 'user_' || id
WHERE username IS NULL;

-- Update NULL bios with contextual defaults
UPDATE users 
SET bio = CASE 
    WHEN full_name IS NOT NULL THEN 'Bio for ' || full_name
    ELSE 'No bio available'
END
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
SET profile_json = '{}'::json
WHERE profile_json IS NULL;

-- Log NULL value updates
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % rows with NULL value fixes', updated_count;
END $$;

-- =====================================================
-- STEP 4: HANDLE DUPLICATE USERNAMES
-- =====================================================

-- Create temporary table to track username duplicates
CREATE TEMP TABLE username_duplicates AS
SELECT 
    username,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at, id) as user_ids,
    array_agg(created_at ORDER BY created_at, id) as created_dates
FROM users 
WHERE username IS NOT NULL
GROUP BY username 
HAVING COUNT(*) > 1;

-- Update duplicate usernames (keep the oldest, update others with suffix)
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
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count FROM username_duplicates;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Handled % duplicate username groups, updated % usernames', duplicate_count, updated_count;
END $$;

-- =====================================================
-- STEP 5: HANDLE DUPLICATE AUTH_IDS
-- =====================================================

-- Create temporary table to track auth_id duplicates
CREATE TEMP TABLE auth_duplicates AS
SELECT 
    auth_id,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at, id) as user_ids,
    array_agg(created_at ORDER BY created_at, id) as created_dates
FROM users 
WHERE auth_id IS NOT NULL
GROUP BY auth_id 
HAVING COUNT(*) > 1;

-- For auth_id duplicates, keep the oldest user record, remove others
DELETE FROM users 
WHERE id IN (
    SELECT unnest(user_ids[2:array_length(user_ids, 1)]) 
    FROM auth_duplicates
);

-- Log auth_id duplicate handling
DO $$
DECLARE
    duplicate_count INTEGER;
    deleted_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count FROM auth_duplicates;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Handled % duplicate auth_id groups, deleted % duplicate users', duplicate_count, deleted_count;
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
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Removed % completely duplicate rows', deleted_count;
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
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned % orphaned user records', deleted_count;
END $$;

-- =====================================================
-- STEP 8: UPDATE SEQUENCES
-- =====================================================

-- Update sequences to prevent conflicts
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));

-- Log sequence update
DO $$
BEGIN
    RAISE NOTICE 'Updated users sequence to %', currval('users_id_seq');
END $$;

-- =====================================================
-- STEP 9: FINAL DATA QUALITY ANALYSIS
-- =====================================================

-- Insert final analysis
INSERT INTO data_quality_analysis
SELECT 
    'after_cleaning' as phase,
    COUNT(*) as total_users,
    COUNT(CASE WHEN full_name IS NULL THEN 1 END) as null_full_names,
    COUNT(CASE WHEN username IS NULL THEN 1 END) as null_usernames,
    COUNT(CASE WHEN bio IS NULL THEN 1 END) as null_bios,
    COUNT(CASE WHEN address IS NULL THEN 1 END) as null_addresses,
    COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as null_phones,
    COUNT(CASE WHEN profile_json IS NULL THEN 1 END) as null_profiles,
    COUNT(CASE WHEN auth_id IS NULL THEN 1 END) as null_auth_ids,
    (SELECT COUNT(*) FROM (
        SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING COUNT(*) > 1
    ) t) as duplicate_usernames,
    (SELECT COUNT(*) FROM (
        SELECT auth_id FROM users WHERE auth_id IS NOT NULL GROUP BY auth_id HAVING COUNT(*) > 1
    ) t) as duplicate_auth_ids,
    (SELECT COUNT(*) FROM users WHERE auth_id IS NOT NULL AND auth_id NOT IN (SELECT id FROM auth)) as orphaned_users
FROM users;

-- Log final analysis results
DO $$
DECLARE
    before_analysis RECORD;
    after_analysis RECORD;
BEGIN
    SELECT * INTO before_analysis FROM data_quality_analysis WHERE phase = 'before_cleaning';
    SELECT * INTO after_analysis FROM data_quality_analysis WHERE phase = 'after_cleaning';
    
    RAISE NOTICE 'Data Quality Analysis (After):';
    RAISE NOTICE '  Total users: % (was: %)', after_analysis.total_users, before_analysis.total_users;
    RAISE NOTICE '  NULL full_names: % (was: %)', after_analysis.null_full_names, before_analysis.null_full_names;
    RAISE NOTICE '  NULL usernames: % (was: %)', after_analysis.null_usernames, before_analysis.null_usernames;
    RAISE NOTICE '  NULL bios: % (was: %)', after_analysis.null_bios, before_analysis.null_bios;
    RAISE NOTICE '  NULL addresses: % (was: %)', after_analysis.null_addresses, before_analysis.null_addresses;
    RAISE NOTICE '  NULL phones: % (was: %)', after_analysis.null_phones, before_analysis.null_phones;
    RAISE NOTICE '  NULL profiles: % (was: %)', after_analysis.null_profiles, before_analysis.null_profiles;
    RAISE NOTICE '  NULL auth_ids: % (was: %)', after_analysis.null_auth_ids, before_analysis.null_auth_ids;
    RAISE NOTICE '  Duplicate usernames: % (was: %)', after_analysis.duplicate_usernames, before_analysis.duplicate_usernames;
    RAISE NOTICE '  Duplicate auth_ids: % (was: %)', after_analysis.duplicate_auth_ids, before_analysis.duplicate_auth_ids;
    RAISE NOTICE '  Orphaned users: % (was: %)', after_analysis.orphaned_users, before_analysis.orphaned_users;
END $$;

-- =====================================================
-- STEP 10: VALIDATION AND INTEGRITY CHECKS
-- =====================================================

-- Verify no critical NULL values remain
DO $$
DECLARE
    critical_nulls INTEGER;
BEGIN
    SELECT COUNT(*) INTO critical_nulls 
    FROM users 
    WHERE full_name IS NULL OR username IS NULL;
    
    IF critical_nulls > 0 THEN
        RAISE EXCEPTION 'Critical NULL values remain: % rows with NULL full_name or username', critical_nulls;
    ELSE
        RAISE NOTICE 'Validation passed: No critical NULL values remain';
    END IF;
END $$;

-- Verify no duplicate usernames remain
DO $$
DECLARE
    remaining_duplicates INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_duplicates 
    FROM (
        SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING COUNT(*) > 1
    ) t;
    
    IF remaining_duplicates > 0 THEN
        RAISE EXCEPTION 'Duplicate usernames remain: % duplicate groups', remaining_duplicates;
    ELSE
        RAISE NOTICE 'Validation passed: No duplicate usernames remain';
    END IF;
END $$;

-- Verify no duplicate auth_ids remain
DO $$
DECLARE
    remaining_auth_duplicates INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_auth_duplicates 
    FROM (
        SELECT auth_id FROM users WHERE auth_id IS NOT NULL GROUP BY auth_id HAVING COUNT(*) > 1
    ) t;
    
    IF remaining_auth_duplicates > 0 THEN
        RAISE EXCEPTION 'Duplicate auth_ids remain: % duplicate groups', remaining_auth_duplicates;
    ELSE
        RAISE NOTICE 'Validation passed: No duplicate auth_ids remain';
    END IF;
END $$;

-- =====================================================
-- STEP 11: GENERATE CLEANING REPORT
-- =====================================================

-- Create final report
SELECT 
    'ETL Data Cleaning Report' as report_title,
    now() as cleaning_timestamp,
    (SELECT table_name FROM backup_info) as backup_table,
    before_analysis.total_users as users_before,
    after_analysis.total_users as users_after,
    (before_analysis.total_users - after_analysis.total_users) as users_removed,
    before_analysis.null_full_names as null_names_before,
    after_analysis.null_full_names as null_names_after,
    before_analysis.duplicate_usernames as duplicate_usernames_before,
    after_analysis.duplicate_usernames as duplicate_usernames_after,
    before_analysis.duplicate_auth_ids as duplicate_auth_ids_before,
    after_analysis.duplicate_auth_ids as duplicate_auth_ids_after,
    before_analysis.orphaned_users as orphaned_users_before,
    after_analysis.orphaned_users as orphaned_users_after,
    CASE 
        WHEN after_analysis.null_full_names = 0 
         AND after_analysis.null_usernames = 0 
         AND after_analysis.duplicate_usernames = 0 
         AND after_analysis.duplicate_auth_ids = 0 
         AND after_analysis.orphaned_users = 0
        THEN 'SUCCESS'
        ELSE 'WARNING'
    END as cleaning_status
FROM data_quality_analysis before_analysis
CROSS JOIN data_quality_analysis after_analysis
WHERE before_analysis.phase = 'before_cleaning' 
  AND after_analysis.phase = 'after_cleaning';

-- =====================================================
-- CLEANUP
-- =====================================================

-- Clean up temporary tables
DROP TABLE IF EXISTS username_duplicates;
DROP TABLE IF EXISTS auth_duplicates;
DROP TABLE IF EXISTS data_quality_analysis;
DROP TABLE IF EXISTS backup_info;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'ETL Data Cleaning completed successfully at %', now();
END $$; 