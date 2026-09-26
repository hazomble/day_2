import { z } from "zod";
import { collectReviews, createMasterPlan, savePlan } from "../../../../lib/ai-master";
import { requireMasterAdmin } from "../../../../lib/ai-master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ task: z.string().trim().min(5).max(4000) });

export async function POST(request) {
  try {
    const admin = await requireMasterAdmin(request);
    const { task } = requestSchema.parse(await request.json());
    const reviews = await collectReviews(task);
    const plan = await createMasterPlan(task, reviews);
    const planId = await savePlan({ ownerUid: admin.uid, task, reviews, plan });
    return Response.json({ planId, plan, reviews });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Enter a valid task." : error.message || "Could not create AI plan.";
    return Response.json({ error: message }, { status: /Authentication|Administrator/.test(message) ? 403 : 400 });
  }
}
