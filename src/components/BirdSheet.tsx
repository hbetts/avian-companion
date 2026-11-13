"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import type { SpeciesSummary } from "@/lib/model";
import { BirdDetail } from "./BirdDetail";
import { useMediaQuery } from "./usePolling";

/** Apple's momentum projection: where a flick would come to rest. */
function project(velocity: number, decel = 0.998) {
  return ((velocity / 1000) * decel) / (1 - decel);
}

export function BirdSheet({ slug, seed, onClose }: { slug: string | null; seed?: SpeciesSummary; onClose: () => void }) {
  const wide = useMediaQuery("(min-width: 900px)");
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [slug, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = sheetRef.current?.offsetHeight ?? 600;
    const landing = info.offset.y + project(info.velocity.y);
    // the sign of the velocity decides when it is clearly moving; otherwise the projected landing point
    if (info.velocity.y > 700 || (info.velocity.y >= 0 && landing > h * 0.33)) onClose();
  };

  const spring = reduced ? { duration: 0.2 } : { type: "spring" as const, bounce: 0.12, duration: 0.42 };

  return (
    <AnimatePresence>
      {slug && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-40"
            style={{ background: "var(--scrim)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key={`sheet-${wide ? "side" : "bottom"}`}
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Bird details"
            className={`sheet fixed z-50 flex flex-col ${wide ? "top-0 right-0 bottom-0 w-[460px] max-w-[92vw]" : "left-0 right-0 bottom-0 max-h-[92dvh] rounded-t-[28px]"}`}
            style={{ touchAction: "none", willChange: "transform" }}
            initial={reduced ? { opacity: 0 } : wide ? { x: "100%" } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : wide ? { x: 0 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : wide ? { x: "100%", transition: { type: "spring", bounce: 0, duration: 0.35 } } : { y: "100%", transition: { type: "spring", bounce: 0, duration: 0.35 } }}
            transition={spring}
            drag={wide || reduced ? false : "y"}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.95 }}
            dragSnapToOrigin
            dragTransition={{ bounceStiffness: 520, bounceDamping: 46 }}
            onDragEnd={onDragEnd}
          >
            {/* grab area: the handle and the top strip start a drag; content below scrolls */}
            <div
              className="shrink-0 flex items-center justify-between px-3 pt-2 pb-1 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => !wide && controls.start(e)}
              style={{ touchAction: "none" }}
            >
              {!wide ? <span className="mx-auto block w-10 h-1.5 rounded-full" style={{ background: "var(--hairline)" }} aria-hidden /> : <span />}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="pressable absolute right-3 top-3 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M2 2l10 10M12 2L2 12" /></svg>
              </button>
            </div>
            <div className="sheet-scroll flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
              <BirdDetail key={slug} slug={slug} seed={seed} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
