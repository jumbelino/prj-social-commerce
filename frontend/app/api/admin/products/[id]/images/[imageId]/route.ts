import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { API_BASE_URL } from "@/lib/api";

const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? API_BASE_URL;

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ detail: "Unauthorized." }, { status: 401 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return unauthorizedResponse();
  }

  const { id: productId, imageId } = await params;

  let response: Response;
  try {
    response = await fetch(
      `${INTERNAL_API_BASE_URL}/admin/products/${productId}/images/${imageId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
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
    const payload = (await response.json()) as unknown;
    return NextResponse.json(payload, { status: response.status });
  }

  return new NextResponse(null, { status: response.status });
}
