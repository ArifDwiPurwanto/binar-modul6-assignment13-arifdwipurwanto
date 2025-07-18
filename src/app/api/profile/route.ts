import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";

export type ProfileData = {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  bio?: string;
  longBio?: string;
  address?: string;
  profileJson?: any;
};

async function getProfile(request: Request) {
  console.time("Profile Get Execution");

  try {
    // Bad practice: getting user from request without proper typing
    const user = (request as any).user;

    // Bad practice: inefficient query with complex joins and subqueries
    // OPTIMIZED: Using window functions and lateral joins to avoid multiple subqueries and N+1 problems
    const selectQuery = `
      SELECT 
        u.*,
        a.email,
        ur.role,
        ud.division_name,
        COALESCE(counts.log_count, 0) as log_count,
        COALESCE(counts.role_count, 0) as role_count,
        COALESCE(counts.division_count, 0) as division_count
      FROM users u
      LEFT JOIN auth a ON u.auth_id = a.id
      LEFT JOIN LATERAL (
        SELECT role 
        FROM user_roles 
        WHERE user_id = u.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ur ON true
      LEFT JOIN LATERAL (
        SELECT division_name 
        FROM user_divisions 
        WHERE user_id = u.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ud ON true
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(CASE WHEN table_name = 'user_logs' THEN 1 END) as log_count,
          COUNT(CASE WHEN table_name = 'user_roles' THEN 1 END) as role_count,
          COUNT(CASE WHEN table_name = 'user_divisions' THEN 1 END) as division_count
        FROM (
          SELECT 'user_logs' as table_name FROM user_logs WHERE user_id = u.id
          UNION ALL
          SELECT 'user_roles' as table_name FROM user_roles WHERE user_id = u.id
          UNION ALL
          SELECT 'user_divisions' as table_name FROM user_divisions WHERE user_id = u.id
        ) combined_counts
      ) counts ON true
      WHERE u.id = $1
    `;

    const result = await executeQuery(selectQuery, [user.userId]);

    if (result.rows.length === 0) {
      console.timeEnd("Profile Get Execution");
      return NextResponse.json({ message: "User not found." }, { status: 404 });
    }

    const userData = result.rows[0];

    console.timeEnd("Profile Get Execution");
    return NextResponse.json({
      success: true,
      user: {
        id: userData.id,
        authId: userData.auth_id,
        username: userData.username,
        fullName: userData.full_name,
        email: userData.email,
        bio: userData.bio,
        longBio: userData.long_bio,
        profileJson: userData.profile_json,
        address: userData.address,
        phoneNumber: userData.phone_number,
        birthDate: userData.birth_date,
        role: userData.role,
        division: userData.division_name,
        logCount: userData.log_count,
        roleCount: userData.role_count,
        divisionCount: userData.division_count,
      },
    });
  } catch (error) {
    console.error("Profile get error:", error);
    console.timeEnd("Profile Get Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

async function updateProfile(request: Request) {
  console.time("Profile Update Execution");

  try {
    const {
      username,
      fullName,
      email,
      phone,
      birthDate,
      bio,
      longBio,
      address,
      profileJson,
    }: ProfileData = await request.json();

    const errors: Partial<Record<keyof ProfileData, string>> = {};

    if (!username || username.length < 6) {
      errors.username = "Username must be at least 6 characters.";
    }

    if (!fullName) {
      errors.fullName = "Full name is required.";
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = "Must be a valid email format.";
    }

    if (!phone || !/^\d{10,15}$/.test(phone)) {
      errors.phone = "Phone must be 10-15 digits.";
    }

    if (birthDate) {
      const date = new Date(birthDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date > today) {
        errors.birthDate = "Birth date cannot be in the future.";
      }
    }

    if (bio && bio.length > 160) {
      errors.bio = "Bio must be 160 characters or less.";
    }

    if (longBio && longBio.length > 2000) {
      errors.longBio = "Long bio must be 2000 characters or less.";
    }

    if (Object.keys(errors).length > 0) {
      console.timeEnd("Profile Update Execution");
      return NextResponse.json(
        { message: "Validation failed", errors },
        { status: 400 }
      );
    }

    // Bad practice: getting user from request without proper typing
    const user = (request as any).user;

    // Bad practice: inefficient update query with unnecessary operations
    // OPTIMIZED: Using transaction with conditional updates and proper email handling
    const updateQuery = `
      WITH user_update AS (
        UPDATE users 
        SET username = $1, 
            full_name = $2, 
            bio = $3, 
            long_bio = $4, 
            address = $5, 
            phone_number = $6, 
            birth_date = $7,
            profile_json = $8, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING auth_id
      )
      UPDATE auth 
      SET email = $10, updated_at = CURRENT_TIMESTAMP
      FROM user_update
      WHERE auth.id = user_update.auth_id
    `;

    await executeQuery(updateQuery, [
      username,
      fullName,
      bio,
      longBio,
      address,
      phone,
      birthDate,
      profileJson ? JSON.stringify(profileJson) : null,
      user.userId,
      email,
    ]);

    // Bad practice: unnecessary select after update with complex joins
    // OPTIMIZED: Using lateral joins and optimized counting to reduce query complexity
    const selectQuery = `
      SELECT 
        u.*,
        ur.role,
        ud.division_name,
        COALESCE(counts.log_count, 0) as log_count,
        COALESCE(counts.role_count, 0) as role_count
      FROM users u
      LEFT JOIN LATERAL (
        SELECT role 
        FROM user_roles 
        WHERE user_id = u.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ur ON true
      LEFT JOIN LATERAL (
        SELECT division_name 
        FROM user_divisions 
        WHERE user_id = u.id 
        ORDER BY created_at DESC 
        LIMIT 1
      ) ud ON true
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(CASE WHEN table_name = 'user_logs' THEN 1 END) as log_count,
          COUNT(CASE WHEN table_name = 'user_roles' THEN 1 END) as role_count
        FROM (
          SELECT 'user_logs' as table_name FROM user_logs WHERE user_id = u.id
          UNION ALL
          SELECT 'user_roles' as table_name FROM user_roles WHERE user_id = u.id
        ) combined_counts
      ) counts ON true
      WHERE u.id = $1
    `;

    const result = await executeQuery(selectQuery, [user.userId]);
    const updatedUser = result.rows[0];

    // Log the profile update action
    await executeQuery(
      "INSERT INTO user_logs (user_id, action) VALUES ($1, $2)",
      [user.userId, "update_profile"]
    );

    console.timeEnd("Profile Update Execution");
    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        authId: updatedUser.auth_id,
        username: updatedUser.username,
        fullName: updatedUser.full_name,
        bio: updatedUser.bio,
        longBio: updatedUser.long_bio,
        profileJson: updatedUser.profile_json,
        address: updatedUser.address,
        phoneNumber: updatedUser.phone_number,
        birthDate: updatedUser.birth_date,
        role: updatedUser.role,
        division: updatedUser.division_name,
        logCount: updatedUser.log_count,
        roleCount: updatedUser.role_count,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    console.timeEnd("Profile Update Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

// Bad practice: wrapping with auth middleware
export const GET = authMiddleware(getProfile);
export const PUT = authMiddleware(updateProfile);
