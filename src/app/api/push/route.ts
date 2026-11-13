import type { PushSubscription } from "web-push";
import { getSubscription, pushConfigured, removeSubscription, saveSubscription, sendTo, type Prefs } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ enabled: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
}

type Body = { action?: "subscribe" | "test" | "status"; subscription?: PushSubscription; prefs?: Partial<Prefs>; endpoint?: string };

export async function POST(req: Request) {
  if (!pushConfigured()) return Response.json({ error: "push not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const action = body.action ?? "subscribe";

  if (action === "subscribe") {
    const sub = body.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return Response.json({ error: "bad subscription" }, { status: 400 });
    const prefs: Prefs = { newSpecies: body.prefs?.newSpecies !== false, firstToday: !!body.prefs?.firstToday };
    await saveSubscription(sub, prefs);
    return Response.json({ ok: true, prefs });
  }
  if (action === "status") {
    if (!body.endpoint) return Response.json({ error: "need endpoint" }, { status: 400 });
    const stored = await getSubscription(body.endpoint);
    return Response.json({ subscribed: !!stored, prefs: stored?.prefs ?? null });
  }
  if (action === "test") {
    if (!body.endpoint) return Response.json({ error: "need endpoint" }, { status: 400 });
    const stored = await getSubscription(body.endpoint);
    if (!stored) return Response.json({ error: "not subscribed" }, { status: 404 });
    const ok = await sendTo(stored, {
      title: "Visitors is listening",
      body: "You will hear about new birds here.",
      icon: `${new URL(req.url).origin}/icons/icon-192.png`,
      url: "/",
      tag: "test",
    });
    return Response.json({ ok });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!body.endpoint) return Response.json({ error: "need endpoint" }, { status: 400 });
  await removeSubscription(body.endpoint);
  return Response.json({ ok: true });
}
