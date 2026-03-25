import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { API_BASE_URL } from "@/lib/api";

const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? API_BASE_URL;

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ detail: "Unauthorized." }, { status: 401 });
}

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

async function relayJsonOrText(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, { status: response.status });
  }

  const textPayload = await response.text();
  if (textPayload.trim() !== "") {
    return NextResponse.json({ detail: textPayload }, { status: response.status });
  }

  return new NextResponse(null, { status: response.status });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ["active", "query", "limit", "offset"]) {
    const value = searchParams.get(key);
    if (value !== null && value.trim() !== "") {
      query.set(key, value);
    }
  }
  const queryString = query.toString();

  let response: Response;
  try {
    response = await fetch(`${INTERNAL_API_BASE_URL}/products${queryString ? `?${queryString}` : ""}`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Could not reach API server. Check backend availability." },
      { status: 502 },
    );
  }

  return relayJsonOrText(response);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return unauthorizedResponse();
  }

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${INTERNAL_API_BASE_URL}/products`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Could not reach API server. Check backend availability." },
      { status: 502 },
    );
  }

  return relayJsonOrText(response);
}
