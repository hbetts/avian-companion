import type { Metadata } from "next";
import Link from "next/link";
import { speciesBySlug } from "@/lib/species";
import { BirdDetail } from "@/components/BirdDetail";
import { Header } from "@/components/Header";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = speciesBySlug(slug);
  return { title: s ? s.com : "Bird", description: s ? `${s.com} (${s.sci}) heard at the window` : undefined };
}

export default async function BirdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = speciesBySlug(slug);
  return (
    <>
      <Header />
      <main className="relative z-10 mx-auto w-full max-w-6xl pb-8 flex-1">
        <div className="px-5 pt-4">
          <Link href="/" className="text-sm" style={{ color: "var(--ink-2)" }}>
            ← Collage
          </Link>
        </div>
        <BirdDetail key={slug} slug={slug} seed={s ? { sci: s.sci, com: s.com, slug: s.slug, art: s.art } : undefined} shared={false} wide />
      </main>
    </>
  );
}
