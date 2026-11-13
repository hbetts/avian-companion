"use client";
import { motion } from "motion/react";
import { artUrl } from "@/lib/species";

type Art = { perched?: { w: number; h: number }; flight?: { w: number; h: number } };

/** A cut-out painting of the bird, or a quiet placeholder when none is painted yet. */
export function BirdArt({
  species,
  pose = "perched",
  layoutId,
  className = "",
  eager = false,
}: {
  species: { slug: string; com: string; art: Art };
  pose?: "perched" | "flight";
  layoutId?: string;
  className?: string;
  eager?: boolean;
}) {
  const p = species.art[pose] ? pose : species.art.perched ? "perched" : species.art.flight ? "flight" : null;
  if (!p) {
    const initials = species.com
      .split(/[\s-]+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("");
    return (
      <motion.div
        layoutId={layoutId}
        className={`w-full h-full flex items-center justify-center ${className}`}
        aria-hidden
      >
        <div
          className="hand rounded-full flex items-center justify-center"
          style={{
            width: "86%",
            maxHeight: "100%",
            aspectRatio: "1",
            background: "#e9e1cc",
            color: "#8a7f70",
            fontSize: "clamp(18px, 40%, 64px)",
            boxShadow: "inset 0 0 0 1px rgba(26,22,18,0.08)",
          }}
        >
          {initials}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.img
      layoutId={layoutId}
      src={artUrl(species.slug, p)}
      alt=""
      draggable={false}
      className={`w-full h-full object-contain pointer-events-none ${className}`}
      style={{ filter: "drop-shadow(0 6px 10px rgba(26,22,18,0.16))" }}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
