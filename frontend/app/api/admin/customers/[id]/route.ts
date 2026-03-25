import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/auth";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const response = await fetch(`${API_BASE}/admin/customers/${id}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
