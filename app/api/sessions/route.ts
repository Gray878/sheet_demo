import { fail, ok } from "@/src/lib/api-response";
import { createSession } from "@/src/server/services/session-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await createSession();
    return ok({ ...session, sessionId: session.id }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
