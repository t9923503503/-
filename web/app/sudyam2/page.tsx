import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { KotcLiveLayout } from "@/components/kotc-live/judge/KotcLiveLayout";
import { buildLegacyIframeSrc, shouldUseClassicMobile } from "@/lib/kotc-legacy";

export const metadata: Metadata = {
  title: "Sudyam | Lutyye Plyazhniki (New)",
  description: "KOTC judge workspace with live seats, court controls, scores, and timers.",
};

interface Sudyam2PageProps {
  searchParams?: Promise<{
    live?: string;
    format?: string;
    tournamentId?: string;
  }>;
}

function normalizeJudgeFormat(value?: string): "ipt" | "thai" | "kotc" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("ipt")) return "ipt";
  if (normalized.includes("thai")) return "thai";
  return "kotc";
}

function buildStandaloneJudgeHref(format: string | undefined, tournamentId: string | undefined): string | null {
  const id = String(tournamentId || "").trim();
  if (!id) return null;

  const judgeFormat = normalizeJudgeFormat(format);
  if (judgeFormat === "ipt") {
    return `/kotc/formats/ipt/ipt.html?trnId=${encodeURIComponent(id)}`;
  }
  if (judgeFormat === "thai") {
    return `/kotc/formats/thai/thai.html?trnId=${encodeURIComponent(id)}`;
  }
  return null;
}

// Middleware already validates sudyam_session, so this route is authenticated.
export default async function Sudyam2Page({ searchParams }: Sudyam2PageProps) {
  const params = (await searchParams) ?? {};
  const standaloneHref = buildStandaloneJudgeHref(params.format, params.tournamentId);
  if (standaloneHref) {
    redirect(standaloneHref);
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const userAgent = headerStore.get("user-agent") ?? "";
  const legacyIframeSrc = buildLegacyIframeSrc(host, proto);

  if (params.live !== "1" && shouldUseClassicMobile(userAgent)) {
    redirect("/sudyam2/classic");
  }

  return <KotcLiveLayout legacyIframeSrc={legacyIframeSrc} />;
}
