// Build id of the deployed server, for the in-app "update ready" toast. Not secret, no auth.
// Route handlers are not cached by default in Next 16; force-dynamic and no-store keep every hop from caching it.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ build: process.env.KROB_BUILD ?? "dev" }, { headers: { "cache-control": "no-store" } });
}
