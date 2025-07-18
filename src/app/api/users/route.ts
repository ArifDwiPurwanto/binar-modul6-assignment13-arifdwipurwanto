import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import {
  httpRequestsTotal,
  httpRequestDuration,
  databaseQueryDuration,
} from "@/lib/metrics";

export async function GET(request: Request) {
  console.time("Users API Execution");
  const start = Date.now();
  const method = request.method;
  const route = "/api/users";

  try {
    // Extract query params with proper parsing
    const url = new URL(request.url);
    const divisionFilter = url.searchParams.get("division");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20", 10);
    const offset = (page - 1) * pageSize;

    // Optimized query: Use window functions instead of subqueries for better performance
    let query = `
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
        ud.division_name,
        COALESCE(us.log_count, 0) as log_count,
        COALESCE(urs.role_count, 0) as role_count,
        COALESCE(uds.division_count, 0) as division_count,
        COALESCE(us.login_count, 0) as login_count,
        COALESCE(us.update_count, 0) as update_count
      FROM users u
      LEFT JOIN auth a ON u.auth_id = a.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN user_divisions ud ON u.id = ud.user_id
      LEFT JOIN user_stats us ON u.id = us.user_id
      LEFT JOIN user_role_stats urs ON u.id = urs.user_id
      LEFT JOIN user_division_stats uds ON u.id = uds.user_id
    `;

    const params: any[] = [];
    let whereClause = "";
    
    if (divisionFilter && divisionFilter !== "all") {
      whereClause = ` WHERE ud.division_name = $1`;
      params.push(divisionFilter);
    }

    query += whereClause;
    query += ` ORDER BY u.created_at DESC, u.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    // Get total count for pagination (optimized separate query)
    let countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_divisions ud ON u.id = ud.user_id
    ` + whereClause;
    
    const countParams = divisionFilter && divisionFilter !== "all" ? [divisionFilter] : [];

    const dbStart = Date.now();
    
    // Execute both queries in parallel for better performance
    const [result, countResult] = await Promise.all([
      executeQuery(query, params),
      executeQuery(countQuery, countParams)
    ]);
    
    const dbDuration = (Date.now() - dbStart) / 1000;
    databaseQueryDuration.observe({ query_type: "users_query" }, dbDuration);
    
    const totalCount = parseInt(countResult.rows[0]?.total || "0", 10);

    // Bad practice: processing all data in memory with complex transformations
    const users = result.rows.map((user: any) => {
      // Bad practice: complex data processing in application layer
      // PostgreSQL JSON type already returns object, no need to parse
      const profileJson = user.profile_json || null;
      const socialMedia = profileJson?.social_media || {};
      const preferences = profileJson?.preferences || {};
      const skills = profileJson?.skills || [];
      const interests = profileJson?.interests || [];

      // Bad practice: unnecessary calculations
      const daysSinceCreated = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      const isActive = user.log_count > 5;
      const isSenior = user.role === "admin" || user.role === "moderator";

      return {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        email: user.email,
        birthDate: user.birth_date,
        bio: user.bio,
        longBio: user.long_bio,
        profileJson: profileJson,
        address: user.address,
        phoneNumber: user.phone_number,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        role: user.role,
        division: user.division_name,
        displayName: user.display_name,
        bioDisplay: user.bio_display,
        instagramHandle: user.instagram_handle,
        // Bad practice: calculated fields that could be computed in SQL
        totalUsers: user.total_users,
        newerUsers: user.newer_users,
        logCount: user.log_count,
        roleCount: user.role_count,
        divisionCount: user.division_count,
        loginCount: user.login_count,
        updateCount: user.update_count,
        recentLogs: user.recent_logs,
        // Bad practice: application-level calculations
        daysSinceCreated,
        isActive,
        isSenior,
        socialMedia,
        preferences,
        skills,
        interests,
        // Bad practice: redundant data
        hasProfile: !!user.profile_json,
        hasBio: !!user.bio,
        hasAddress: !!user.address,
        hasPhone: !!user.phone_number,
        // Bad practice: more redundant calculations
        profileCompleteness:
          ([
            !!user.bio,
            !!user.address,
            !!user.phone_number,
            !!user.profile_json,
          ].filter(Boolean).length /
            4) *
          100,
      };
    });

    // Bad practice: additional processing after mapping
    // const activeUsers = users.filter((u) => u.isActive);
    // const seniorUsers = users.filter((u) => u.isSenior);
    // const usersWithCompleteProfiles = users.filter(
    //   (u) => u.profileCompleteness > 75
    // );
    // const usersByDivision = users.reduce((acc, user) => {
    //   acc[user.division] = (acc[user.division] || 0) + 1;
    //   return acc;
    // }, {} as Record<string, number>);

    // [Imam] - refactored simplify processing
    const summary = users.reduce(
      (acc, user) => {
        if (user.isActive) acc.activeUsers++;
        if (user.isSenior) acc.seniorUsers++;
        if (user.profileCompleteness > 75) acc.usersWithCompleteProfiles++;
        acc.usersByDivision[user.division] =
          (acc.usersByDivision[user.division] || 0) + 1;
        return acc;
      },
      {
        activeUsers: 0,
        seniorUsers: 0,
        usersWithCompleteProfiles: 0,
        usersByDivision: {} as Record<string, number>,
      }
    );

    const {
      activeUsers: activeUserCount,
      seniorUsers: seniorUserCount,
      usersWithCompleteProfiles: usersWithCompleteProfileCount,
      usersByDivision: summarizedUsersByDivision,
    } = summary;

    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe({ method, route }, duration);
    httpRequestsTotal.inc({ method, route, status: "200" });

    console.timeEnd("Users API Execution");
    return NextResponse.json({
      users,
      total: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      activeUsers: activeUserCount,
      seniorUsers: seniorUserCount,
      usersWithCompleteProfiles: usersWithCompleteProfileCount,
      usersByDivision: summarizedUsersByDivision,
      filteredBy: divisionFilter || "all",
      message: "Users retrieved successfully",
    });
  } catch (error) {
    console.error("Users API error:", error);
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe({ method, route }, duration);
    httpRequestsTotal.inc({ method, route, status: "500" });

    console.timeEnd("Users API Execution");
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
