-- Clean NULL and Duplicate Rows in Users Table
-- Database: workshop_db
-- This script removes users with excessive NULL values and duplicate data

-- =====================================
-- PART 1: ANALYZE DATA QUALITY ISSUES
-- =====================================

-- Show statistics of NULL values before cleanup
SELECT 
    'Before Cleanup - NULL Statistics' as status,
    COUNT(*) as total_users,
    COUNT(bio) as users_with_bio,
    COUNT(*) - COUNT(bio) as users_with_null_bio,
    COUNT(address) as users_with_address,
    COUNT(*) - COUNT(address) as users_with_null_address,
    COUNT(phone_number) as users_with_phone,
    COUNT(*) - COUNT(phone_number) as users_with_null_phone,
    COUNT(profile_json) as users_with_profile_json,
    COUNT(*) - COUNT(profile_json) as users_with_null_profile_json
FROM users;

-- Show duplicate statistics before cleanup
SELECT 
    'Before Cleanup - Duplicate Statistics' as status,
    COUNT(*) as total_users,
    COUNT(DISTINCT bio) as unique_bios,
    COUNT(*) - COUNT(DISTINCT bio) as duplicate_bios,
    COUNT(DISTINCT address) as unique_addresses,
    COUNT(*) - COUNT(DISTINCT address) as duplicate_addresses,
    COUNT(DISTINCT phone_number) as unique_phones,
    COUNT(*) - COUNT(DISTINCT phone_number) as duplicate_phones
FROM users;

-- =====================================
-- PART 2: IDENTIFY PROBLEMATIC RECORDS
-- =====================================

-- Show users with multiple NULL fields (problematic quality)
SELECT 
    id, 
    username, 
    full_name,
    CASE WHEN bio IS NULL THEN 1 ELSE 0 END +
    CASE WHEN address IS NULL THEN 1 ELSE 0 END +
    CASE WHEN phone_number IS NULL THEN 1 ELSE 0 END +
    CASE WHEN profile_json IS NULL THEN 1 ELSE 0 END as null_count
FROM users
WHERE 
    (bio IS NULL AND address IS NULL) OR
    (bio IS NULL AND phone_number IS NULL) OR
    (bio IS NULL AND profile_json IS NULL) OR
    (address IS NULL AND phone_number IS NULL) OR
    (address IS NULL AND profile_json IS NULL) OR
    (phone_number IS NULL AND profile_json IS NULL)
ORDER BY null_count DESC, id
LIMIT 10;

-- Show examples of duplicate data
SELECT 
    bio, 
    COUNT(*) as usage_count
FROM users 
WHERE bio IS NOT NULL
GROUP BY bio 
HAVING COUNT(*) > 1
ORDER BY usage_count DESC
LIMIT 5;

-- =====================================
-- PART 3: CLEANUP OPERATIONS
-- =====================================

-- Step 1: Remove users with 3 or more NULL fields (very poor data quality)
-- But preserve the 3 fixed accounts (aku123, kamu123, user123)
DELETE FROM user_logs 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE username NOT IN ('aku123', 'kamu123', 'user123')
    AND (
        (bio IS NULL AND address IS NULL AND phone_number IS NULL) OR
        (bio IS NULL AND address IS NULL AND profile_json IS NULL) OR
        (bio IS NULL AND phone_number IS NULL AND profile_json IS NULL) OR
        (address IS NULL AND phone_number IS NULL AND profile_json IS NULL)
    )
);

DELETE FROM user_roles 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE username NOT IN ('aku123', 'kamu123', 'user123')
    AND (
        (bio IS NULL AND address IS NULL AND phone_number IS NULL) OR
        (bio IS NULL AND address IS NULL AND profile_json IS NULL) OR
        (bio IS NULL AND phone_number IS NULL AND profile_json IS NULL) OR
        (address IS NULL AND phone_number IS NULL AND profile_json IS NULL)
    )
);

DELETE FROM user_divisions 
WHERE user_id IN (
    SELECT id FROM users 
    WHERE username NOT IN ('aku123', 'kamu123', 'user123')
    AND (
        (bio IS NULL AND address IS NULL AND phone_number IS NULL) OR
        (bio IS NULL AND address IS NULL AND profile_json IS NULL) OR
        (bio IS NULL AND phone_number IS NULL AND profile_json IS NULL) OR
        (address IS NULL AND phone_number IS NULL AND profile_json IS NULL)
    )
);

-- Remove the problematic users (but keep fixed accounts)
DELETE FROM users 
WHERE username NOT IN ('aku123', 'kamu123', 'user123')
AND (
    (bio IS NULL AND address IS NULL AND phone_number IS NULL) OR
    (bio IS NULL AND address IS NULL AND profile_json IS NULL) OR
    (bio IS NULL AND phone_number IS NULL AND profile_json IS NULL) OR
    (address IS NULL AND phone_number IS NULL AND profile_json IS NULL)
);

-- Step 2: Clean duplicate data by keeping only the first occurrence
-- Create a temporary table to identify records to keep
CREATE TEMP TABLE users_to_keep AS
SELECT 
    id,
    ROW_NUMBER() OVER (
        PARTITION BY 
            COALESCE(bio, 'NULL_BIO'),
            COALESCE(address, 'NULL_ADDRESS'),
            COALESCE(phone_number, 'NULL_PHONE')
        ORDER BY id ASC
    ) as row_num
FROM users
WHERE username NOT IN ('aku123', 'kamu123', 'user123'); -- Always preserve fixed accounts

-- Delete related data for duplicate users
DELETE FROM user_logs 
WHERE user_id IN (
    SELECT u.id 
    FROM users u
    JOIN users_to_keep utk ON u.id = utk.id
    WHERE utk.row_num > 1
);

DELETE FROM user_roles 
WHERE user_id IN (
    SELECT u.id 
    FROM users u
    JOIN users_to_keep utk ON u.id = utk.id
    WHERE utk.row_num > 1
);

DELETE FROM user_divisions 
WHERE user_id IN (
    SELECT u.id 
    FROM users u
    JOIN users_to_keep utk ON u.id = utk.id
    WHERE utk.row_num > 1
);

-- Delete the duplicate users (keeping the first occurrence of each duplicate set)
DELETE FROM users 
WHERE id IN (
    SELECT u.id 
    FROM users u
    JOIN users_to_keep utk ON u.id = utk.id
    WHERE utk.row_num > 1
);

-- Step 3: Update remaining NULL values with default data where appropriate
-- Fill NULL bios with a default message
UPDATE users 
SET bio = 'No bio provided'
WHERE bio IS NULL AND username NOT IN ('aku123', 'kamu123', 'user123');

-- Fill NULL addresses with a default message
UPDATE users 
SET address = 'Address not specified'
WHERE address IS NULL AND username NOT IN ('aku123', 'kamu123', 'user123');

-- Fill NULL phone numbers with a placeholder
UPDATE users 
SET phone_number = '+62000000000'
WHERE phone_number IS NULL AND username NOT IN ('aku123', 'kamu123', 'user123');

-- Fill NULL profile_json with a basic structure
UPDATE users 
SET profile_json = '{"preferences": {"theme": "light", "language": "id", "notifications": true}, "social_media": {}, "skills": [], "interests": []}'::json
WHERE profile_json IS NULL AND username NOT IN ('aku123', 'kamu123', 'user123');

-- =====================================
-- PART 4: VERIFY CLEANUP RESULTS
-- =====================================

-- Show statistics after cleanup
SELECT 
    'After Cleanup - NULL Statistics' as status,
    COUNT(*) as total_users,
    COUNT(bio) as users_with_bio,
    COUNT(*) - COUNT(bio) as users_with_null_bio,
    COUNT(address) as users_with_address,
    COUNT(*) - COUNT(address) as users_with_null_address,
    COUNT(phone_number) as users_with_phone,
    COUNT(*) - COUNT(phone_number) as users_with_null_phone,
    COUNT(profile_json) as users_with_profile_json,
    COUNT(*) - COUNT(profile_json) as users_with_null_profile_json
FROM users;

-- Show duplicate statistics after cleanup
SELECT 
    'After Cleanup - Duplicate Statistics' as status,
    COUNT(*) as total_users,
    COUNT(DISTINCT bio) as unique_bios,
    COUNT(*) - COUNT(DISTINCT bio) as duplicate_bios,
    COUNT(DISTINCT address) as unique_addresses,
    COUNT(*) - COUNT(DISTINCT address) as duplicate_addresses,
    COUNT(DISTINCT phone_number) as unique_phones,
    COUNT(*) - COUNT(DISTINCT phone_number) as duplicate_phones
from users;

-- Verify fixed accounts are still present
SELECT 
    'Fixed Accounts Verification' as status,
    username, 
    email,
    full_name,
    CASE WHEN bio IS NULL THEN 'NULL' ELSE 'HAS_VALUE' END as bio_status,
    CASE WHEN address IS NULL THEN 'NULL' ELSE 'HAS_VALUE' END as address_status
FROM users u
JOIN auth a ON u.auth_id = a.id
WHERE username IN ('aku123', 'kamu123', 'user123')
ORDER BY username;

-- Show final data quality summary
SELECT 
    'Final Summary' as status,
    COUNT(*) as total_users_remaining,
    COUNT(*) FILTER (WHERE bio IS NOT NULL) as users_with_valid_bio,
    COUNT(*) FILTER (WHERE address IS NOT NULL) as users_with_valid_address,
    COUNT(*) FILTER (WHERE phone_number IS NOT NULL) as users_with_valid_phone,
    COUNT(*) FILTER (WHERE profile_json IS NOT NULL) as users_with_valid_profile_json,
    ROUND(
        (COUNT(*) FILTER (WHERE bio IS NOT NULL AND address IS NOT NULL AND phone_number IS NOT NULL AND profile_json IS NOT NULL)::DECIMAL 
         / COUNT(*) * 100), 2
    ) as complete_profiles_percentage
FROM users;

-- =====================================
-- PART 5: CLEANUP TEMPORARY OBJECTS
-- =====================================

-- Drop temporary table
DROP TABLE IF EXISTS users_to_keep;

-- Show final message
SELECT 'Data cleanup completed successfully! Users table has been cleaned of NULL and duplicate values.' as message;
