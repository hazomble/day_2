import { z } from "zod";
import { executePlan } from "../../../../lib/ai-master";
import { requireMasterAdmin } from "../../../../lib/ai-master-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ planId: z.string().min(1).max(128) });

export async function POST(request) {
  try {
    const admin = await requireMasterAdmin(request);
    const { planId } = requestSchema.parse(await request.json());
    return Response.json(await executePlan({ planId, ownerUid: admin.uid }));
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid plan identifier." : error.message || "Could not execute the plan.";
    return Response.json({ error: message }, { status: /Authentication|Administrator/.test(message) ? 403 : 400 });
  }
}
