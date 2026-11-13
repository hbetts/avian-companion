import { createHash } from "node:crypto";
import { sendNotification, setVapidDetails, type PushSubscription } from "web-push";
import { getJSON, putJSON, listKeys, deleteKeys } from "./store";
import type { BirdEvent } from "./model";
import { describe, artUrl } from "./species";

export type Prefs = { newSpecies: boolean; firstToday: boolean };
export type StoredSub = { subscription: PushSubscription; prefs: Prefs; created: string };

const configured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function setup() {
  if (ready || !configured()) return;
  setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:visitors@example.invalid",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
}

export const subId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
const subKey = (endpoint: string) => `subs/${subId(endpoint)}.json`;

export async function saveSubscription(subscription: PushSubscription, prefs: Prefs) {
  await putJSON(subKey(subscription.endpoint), { subscription, prefs, created: new Date().toISOString() } satisfies StoredSub);
}
export async function removeSubscription(endpoint: string) {
  await deleteKeys([subKey(endpoint)]);
}
export async function getSubscription(endpoint: string) {
  return getJSON<StoredSub>(subKey(endpoint), { fresh: true });
}

async function allSubscriptions(): Promise<StoredSub[]> {
  const keys = await listKeys("subs/");
  const subs = await Promise.all(keys.map((k) => getJSON<StoredSub>(k, { fresh: true })));
  return subs.filter((s): s is StoredSub => !!s?.subscription?.endpoint);
}

export type PushMessage = { title: string; body: string; icon?: string; image?: string; url?: string; tag?: string; renotify?: boolean };

export async function sendTo(sub: StoredSub, msg: PushMessage): Promise<boolean> {
  setup();
  if (!ready) return false;
  try {
    await sendNotification(sub.subscription, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "normal" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await removeSubscription(sub.subscription.endpoint);
    return false;
  }
}

/** Fan out the station's events to everyone whose preferences match. */
export async function notifyEvents(events: BirdEvent[], origin: string): Promise<number> {
  setup();
  if (!ready || !events.length) return 0;
  const subs = await allSubscriptions();
  if (!subs.length) return 0;
  let sent = 0;
  for (const ev of events) {
    const info = describe(ev.sci, ev.com);
    const time = ev.time.slice(11, 16);
    const msg: PushMessage =
      ev.type === "new_species"
        ? { title: `New bird: ${info.com}`, body: `Heard for the first time at ${time}. Tap to see it.`, tag: `new-${info.slug}` }
        : { title: `${info.com} is back`, body: `First call of the day at ${time}.`, tag: `today-${info.slug}` };
    if (info.art.perched) msg.icon = `${origin}${artUrl(info.slug)}`;
    msg.url = `/bird/${info.slug}`;
    for (const sub of subs) {
      const want = ev.type === "new_species" ? sub.prefs?.newSpecies !== false : !!sub.prefs?.firstToday;
      if (!want) continue;
      if (await sendTo(sub, msg)) sent += 1;
    }
  }
  return sent;
}

export const pushConfigured = configured;
