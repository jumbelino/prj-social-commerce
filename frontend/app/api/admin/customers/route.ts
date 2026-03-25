import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { NextResponse } from "next/server";

const API_BASE = process.env.INTERNAL_API_BASE_URL || "http://localhost:8000";

function isAdminSession(
  session: unknown
): session is { accessToken: string; roles?: string[] } {
  if (!session || typeof session !== "object") {
    return false;
  }
  const candidate = session as { accessToken?: unknown; roles?: unknown };
  return (
    typeof candidate.accessToken === "string" &&
    Array.isArray(candidate.roles) &&
    candidate.roles.includes("admin")
  );
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (limit) params.set("limit", limit);
  if (offset) params.set("offset", offset);
  const queryString = params.toString();

  const response = await fetch(`${API_BASE}/admin/customers${queryString ? `?${queryString}` : ""}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const response = await fetch(`${API_BASE}/admin/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
