import { Suspense } from "react";
import { HomeView } from "@/components/HomeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm" style={{ color: "var(--ink-soft)" }}>Loading…</div>}>
      <HomeView />
    </Suspense>
  );
}
