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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdminSession(session)) {
    return unauthorizedResponse();
  }

  const { id: productId } = await params;

  const formData = await request.formData();
  const file = formData.get("file");
  
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ detail: "No file provided." }, { status: 400 });
  }

  const backendFormData = new FormData();
  backendFormData.append("file", file);

  let response: Response;
  try {
    response = await fetch(
      `${INTERNAL_API_BASE_URL}/admin/products/${productId}/images/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: backendFormData,
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
    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, { status: response.status });
  }

  const textPayload = await response.text();
  if (textPayload.trim() !== "") {
    return NextResponse.json({ detail: textPayload }, { status: response.status });
  }

  return new NextResponse(null, { status: response.status });
}
