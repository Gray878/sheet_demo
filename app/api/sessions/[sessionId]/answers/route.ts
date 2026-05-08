import { fail, ok } from "@/src/lib/api-response";
import { saveAnswers } from "@/src/server/services/session-service";
import { saveAnswersSchema } from "@/src/server/validation/answer-schema";
import { sessionIdSchema } from "@/src/server/validation/session-schema";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    const body = saveAnswersSchema.parse(await request.json());
    return ok(await saveAnswers(sessionIdSchema.parse(sessionId), body));
  } catch (error) {
    return fail(error);
  }
}
