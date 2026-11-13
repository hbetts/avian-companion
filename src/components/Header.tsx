"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotifyButton } from "./NotifyButton";

export function Header({ children, status }: { children?: React.ReactNode; status?: React.ReactNode }) {
  const path = usePathname();
  const station = process.env.NEXT_PUBLIC_STATION_NAME || "the window";
  return (
    <header className="glass sticky top-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-6xl px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="mr-auto min-w-0">
          <Link href="/" className="display text-[1.7rem] leading-none block">
            Visitors
          </Link>
          <div className="text-xs mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>
            {status ?? `Birds heard near ${station}`}
          </div>
        </div>
        <nav className="flex items-center gap-1 text-sm font-medium order-3 sm:order-2 w-full sm:w-auto">
          <Tab href="/" active={path === "/"}>Collage</Tab>
          <Tab href="/stats" active={path.startsWith("/stats")}>Stats</Tab>
          {children && <div className="ml-auto sm:ml-2">{children}</div>}
        </nav>
        <div className="order-2 sm:order-3">
          <NotifyButton />
        </div>
      </div>
    </header>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="pressable px-3 py-1.5 rounded-full"
      style={{ background: active ? "var(--paper-3)" : "transparent", color: active ? "var(--ink)" : "var(--ink-2)" }}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
