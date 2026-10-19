import { reportCsv } from "@/server/reports";
import { currentActor } from "@/server/current";
import { publicErrorMessage } from "@/server/errors";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return new Response("Forbidden", { status: 403 });
  const actor = await currentActor();
  if (!actor) return new Response("Sign in required", { status: 401 });
  const { slug } = await context.params;
  const url = new URL(request.url);
  try {
    const file = await reportCsv(actor, slug, {
      branchId: url.searchParams.get("branch") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    return new Response(file.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(publicErrorMessage(error), { status: 400 });
  }
}
