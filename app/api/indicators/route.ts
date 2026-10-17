import { NextResponse } from "next/server";
import { indicators } from "@/lib/ine/catalog";
export async function GET() { return NextResponse.json({ indicators }); }
