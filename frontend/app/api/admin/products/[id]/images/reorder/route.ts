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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return unauthorizedResponse();
  }

  const { id: productId } = await params;

  let payload: unknown;
  try {
    payload = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${INTERNAL_API_BASE_URL}/admin/products/${productId}/images/reorder`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );
  } catch {
    return NextResponse.json(
      { detail: "Could not reach API server. Check backend availability." },
      { status: 502 }
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const jsonResponse = (await response.json()) as unknown;
    return NextResponse.json(jsonResponse, { status: response.status });
  }

  const textPayload = await response.text();
  if (textPayload.trim() !== "") {
    return NextResponse.json({ detail: textPayload }, { status: response.status });
  }

  return new NextResponse(null, { status: response.status });
}
