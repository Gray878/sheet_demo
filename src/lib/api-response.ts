import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/src/server/domain/errors";

export function requestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      data,
      error: null,
      meta: { requestId: requestId() }
    },
    init
  );
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        },
        meta: { requestId: requestId() }
      },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body failed validation",
          details: error.issues
        },
        meta: { requestId: requestId() }
      },
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";

  return NextResponse.json(
    {
      data: null,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message,
        details: []
      },
      meta: { requestId: requestId() }
    },
    { status: 500 }
  );
}
