import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(categories);
  return NextResponse.json({ categories: rows });
}
