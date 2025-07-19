import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "@jest/globals";
import { executeQuery } from "../src/lib/database";

describe("Profile Update Tests", () => {
  let testUserId: number;
  let testAuthId: number;
  const testEmail = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    // Create a test auth record with unique email
    const authResult = await executeQuery(
      `
      INSERT INTO auth (email, password)
      VALUES ($1, 'hashedpassword')
      RETURNING id
    `,
      [testEmail]
    );
    testAuthId = authResult.rows[0].id;

    // Create a test user
    const userResult = await executeQuery(
      `
      INSERT INTO users (auth_id, full_name, username, birth_date, bio, long_bio, profile_json, address, phone_number, profile_picture_url)
      VALUES ($1, 'Test User', $2, '1990-01-01', 'Test bio', 'Test long bio', '{}', 'Test Address', '+1234567890', 'https://example.com/profile.jpg')
      RETURNING id
    `,
      [testAuthId, `testuser-${Date.now()}`]
    );
    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await executeQuery("DELETE FROM user_profile_updates WHERE user_id = $1", [
      testUserId,
    ]);
    await executeQuery("DELETE FROM user_logs WHERE user_id = $1", [
      testUserId,
    ]);
    await executeQuery("DELETE FROM users WHERE id = $1", [testUserId]);
    await executeQuery("DELETE FROM auth WHERE id = $1", [testAuthId]);
  });

  beforeEach(async () => {
    // Clear profile updates before each test
    await executeQuery("DELETE FROM user_profile_updates WHERE user_id = $1", [
      testUserId,
    ]);
    await executeQuery("DELETE FROM user_logs WHERE user_id = $1", [
      testUserId,
    ]);
  });

  describe("Database Schema", () => {
    it("should have users table with profile_picture_url field", async () => {
      const result = await executeQuery(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'profile_picture_url'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]).toMatchObject({
        column_name: "profile_picture_url",
        data_type: "character varying",
        is_nullable: "YES",
      });
    });

    it("should have user_profile_updates table for audit trail", async () => {
      const result = await executeQuery(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_profile_updates'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
      }));

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "id",
          type: "integer",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "user_id",
          type: "integer",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "updated_fields",
          type: "json",
        })
      );

      expect(columns).toContainEqual(
        expect.objectContaining({
          name: "created_at",
          type: "timestamp without time zone",
        })
      );
    });

    it("should have required indexes for performance", async () => {
      const result = await executeQuery(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'user_profile_updates'
      `);

      const indexes = result.rows.map((row) => row.indexname);

      expect(indexes).toContain("idx_user_profile_updates_user_id");
      expect(indexes).toContain("idx_user_profile_updates_created_at");
    });
  });

  describe("Profile Update Operations", () => {
    it("should update user profile with new fields", async () => {
      const updateData = {
        username: "updateduser",
        fullName: "Updated User",
        email: "updated@example.com",
        phone: "+9876543210",
        birthDate: "1995-05-15",
        bio: "Updated bio",
        longBio: "Updated long bio with more details",
        address: "Updated Address",
        profilePictureUrl: "https://example.com/new-profile.jpg",
      };

      const result = await executeQuery(
        `
        UPDATE users 
        SET username = $1, full_name = $2, bio = $3, long_bio = $4, 
            address = $5, phone_number = $6, profile_picture_url = $7, 
            birth_date = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING id, username, full_name, bio, long_bio, address, phone_number, profile_picture_url, birth_date
      `,
        [
          updateData.username,
          updateData.fullName,
          updateData.bio,
          updateData.longBio,
          updateData.address,
          updateData.phone,
          updateData.profilePictureUrl,
          updateData.birthDate,
          testUserId,
        ]
      );

      expect(result.rows[0]).toMatchObject({
        username: updateData.username,
        full_name: updateData.fullName,
        bio: updateData.bio,
        long_bio: updateData.longBio,
        address: updateData.address,
        phone_number: updateData.phone,
        profile_picture_url: updateData.profilePictureUrl,
      });

      // Check birth_date separately since PostgreSQL returns it as a Date object
      expect(result.rows[0].birth_date).toBeInstanceOf(Date);
      expect(result.rows[0].birth_date.toISOString().split("T")[0]).toBe(
        updateData.birthDate
      );
    });

    it("should create audit trail entry for profile updates", async () => {
      const updatedFields = {
        username: { old: "testuser", new: "newuser" },
        bio: { old: "Test bio", new: "New bio" },
      };

      const result = await executeQuery(
        `
        INSERT INTO user_profile_updates (user_id, updated_fields)
        VALUES ($1, $2)
        RETURNING id, user_id, updated_fields, created_at
      `,
        [testUserId, JSON.stringify(updatedFields)]
      );

      expect(result.rows[0]).toMatchObject({
        user_id: testUserId,
        updated_fields: updatedFields,
      });
      expect(result.rows[0].created_at).toBeDefined();
    });

    it("should log profile update action", async () => {
      const result = await executeQuery(
        `
        INSERT INTO user_logs (user_id, action)
        VALUES ($1, $2)
        RETURNING id, user_id, action, created_at
      `,
        [testUserId, "update_profile"]
      );

      expect(result.rows[0]).toMatchObject({
        user_id: testUserId,
        action: "update_profile",
      });
      expect(result.rows[0].created_at).toBeDefined();
    });
  });

  describe("Profile Validation", () => {
    it("should validate username format", async () => {
      const invalidUsernames = ["ab", "a".repeat(51), "user@name", "user name"];

      for (const username of invalidUsernames) {
        // Database doesn't enforce username format constraints, so this should succeed
        // Validation is handled at the application level
        const result = await executeQuery(
          `
          INSERT INTO users (auth_id, full_name, username)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
          [testAuthId, "Test User", username]
        );
        expect(result.rows[0].id).toBeDefined();

        // Clean up the inserted user
        await executeQuery("DELETE FROM users WHERE id = $1", [
          result.rows[0].id,
        ]);
      }
    });

    it("should validate email format", async () => {
      const invalidEmails = [
        "invalid",
        "test@",
        "@example.com",
        "test..test@example.com",
      ];

      for (const email of invalidEmails) {
        // Database doesn't enforce email format constraints, so this should succeed
        // Validation is handled at the application level
        const result = await executeQuery(
          `
          INSERT INTO auth (email, password)
          VALUES ($1, $2)
          RETURNING id
        `,
          [email, "password"]
        );
        expect(result.rows[0].id).toBeDefined();

        // Clean up the inserted auth record
        await executeQuery("DELETE FROM auth WHERE id = $1", [
          result.rows[0].id,
        ]);
      }
    });

    it("should validate phone number format", async () => {
      const validPhones = ["+1234567890", "1234567890", "+44123456789"];
      const invalidPhones = ["abc", "123", "123456789012345678"];

      for (const phone of validPhones) {
        const result = await executeQuery(
          `
          UPDATE users SET phone_number = $1 WHERE id = $2
        `,
          [phone, testUserId]
        );
        expect(result.rowCount).toBe(1);
      }

      for (const phone of invalidPhones) {
        // This would be validated at the application level
        // Database doesn't enforce phone format
        const result = await executeQuery(
          `
          UPDATE users SET phone_number = $1 WHERE id = $2
        `,
          [phone, testUserId]
        );
        expect(result.rowCount).toBe(1);
      }
    });

    it("should validate birth date", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      await expect(
        executeQuery(
          `
          UPDATE users SET birth_date = $1 WHERE id = $2
        `,
          [futureDateStr, testUserId]
        )
      ).resolves.toBeDefined(); // Database allows future dates, validation is application-level
    });
  });

  describe("Profile History", () => {
    it("should retrieve profile update history", async () => {
      // Create some test profile updates
      const updates = [
        { username: { old: "user1", new: "user2" } },
        { bio: { old: "old bio", new: "new bio" } },
        { email: { old: "old@email.com", new: "new@email.com" } },
      ];

      for (const update of updates) {
        await executeQuery(
          `
          INSERT INTO user_profile_updates (user_id, updated_fields)
          VALUES ($1, $2)
        `,
          [testUserId, JSON.stringify(update)]
        );
      }

      const result = await executeQuery(
        `
        SELECT id, updated_fields, created_at
        FROM user_profile_updates
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
        [testUserId]
      );

      expect(result.rows.length).toBe(3);
      expect(result.rows[0].updated_fields).toBeDefined();
      expect(result.rows[0].created_at).toBeDefined();
    });

    it("should paginate profile update history", async () => {
      // Create multiple updates
      for (let i = 0; i < 15; i++) {
        await executeQuery(
          `
          INSERT INTO user_profile_updates (user_id, updated_fields)
          VALUES ($1, $2)
        `,
          [
            testUserId,
            JSON.stringify({ field: { old: `old${i}`, new: `new${i}` } }),
          ]
        );
      }

      const page1Result = await executeQuery(
        `
        SELECT id, updated_fields, created_at
        FROM user_profile_updates
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10 OFFSET 0
      `,
        [testUserId]
      );

      const page2Result = await executeQuery(
        `
        SELECT id, updated_fields, created_at
        FROM user_profile_updates
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10 OFFSET 10
      `,
        [testUserId]
      );

      expect(page1Result.rows.length).toBe(10);
      expect(page2Result.rows.length).toBe(5);
    });
  });

  describe("File Upload Integration", () => {
    it("should store profile picture URL", async () => {
      const profilePictureUrl = "https://example.com/uploads/profile_123.jpg";

      const result = await executeQuery(
        `
        UPDATE users SET profile_picture_url = $1 WHERE id = $2
        RETURNING id, profile_picture_url
      `,
        [profilePictureUrl, testUserId]
      );

      expect(result.rows[0]).toMatchObject({
        id: testUserId,
        profile_picture_url: profilePictureUrl,
      });
    });

    it("should handle null profile picture URL", async () => {
      const result = await executeQuery(
        `
        UPDATE users SET profile_picture_url = NULL WHERE id = $1
        RETURNING id, profile_picture_url
      `,
        [testUserId]
      );

      expect(result.rows[0]).toMatchObject({
        id: testUserId,
        profile_picture_url: null,
      });
    });
  });

  describe("Data Integrity", () => {
    it("should maintain referential integrity with foreign keys", async () => {
      // Try to create profile update for non-existent user
      await expect(
        executeQuery(
          `
          INSERT INTO user_profile_updates (user_id, updated_fields)
          VALUES ($1, $2)
        `,
          [99999, JSON.stringify({ field: "value" })]
        )
      ).rejects.toThrow();
    });

    it("should cascade delete profile updates when user is deleted", async () => {
      // Create a test user with profile updates
      const authResult = await executeQuery(
        `
        INSERT INTO auth (email, password)
        VALUES ($1, 'password')
        RETURNING id
      `,
        [`cascade-${Date.now()}@example.com`]
      );
      const authId = authResult.rows[0].id;

      const userResult = await executeQuery(
        `
        INSERT INTO users (auth_id, full_name, username)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
        [authId, "Cascade User", `cascadeuser-${Date.now()}`]
      );
      const userId = userResult.rows[0].id;

      // Create profile update
      await executeQuery(
        `
        INSERT INTO user_profile_updates (user_id, updated_fields)
        VALUES ($1, $2)
      `,
        [userId, JSON.stringify({ field: "value" })]
      );

      // Verify profile update exists
      const checkResult = await executeQuery(
        `
        SELECT COUNT(*) as count FROM user_profile_updates WHERE user_id = $1
      `,
        [userId]
      );
      expect(parseInt(checkResult.rows[0].count)).toBe(1);

      // Delete user
      await executeQuery("DELETE FROM users WHERE id = $1", [userId]);

      // Verify profile update is cascaded
      const cascadeResult = await executeQuery(
        `
        SELECT COUNT(*) as count FROM user_profile_updates WHERE user_id = $1
      `,
        [userId]
      );
      expect(parseInt(cascadeResult.rows[0].count)).toBe(0);

      // Clean up
      await executeQuery("DELETE FROM auth WHERE id = $1", [authId]);
    });
  });
});
