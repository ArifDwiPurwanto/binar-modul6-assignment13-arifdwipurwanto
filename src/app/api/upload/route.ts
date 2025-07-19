import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/jwt";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Configure upload settings
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

async function uploadFile(request: NextRequest) {
  console.time("File Upload Execution");

  try {
    const user = (request as any).user;
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.timeEnd("File Upload Execution");
      return NextResponse.json(
        { message: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.timeEnd("File Upload Execution");
      return NextResponse.json(
        { message: "Invalid file type. Only JPEG, PNG, and WebP are allowed" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.timeEnd("File Upload Execution");
      return NextResponse.json(
        { message: "File size too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    // Create upload directory if it doesn't exist
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split(".").pop();
    const filename = `${user.userId}_${timestamp}_${randomString}.${fileExtension}`;
    const filepath = join(UPLOAD_DIR, filename);

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Generate public URL
    const publicUrl = `/uploads/${filename}`;

    console.timeEnd("File Upload Execution");
    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: filename,
      size: file.size,
      mimeType: file.type,
    });
  } catch (error) {
    console.error("File upload error:", error);
    console.timeEnd("File Upload Execution");
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}

export const POST = authMiddleware(uploadFile);
