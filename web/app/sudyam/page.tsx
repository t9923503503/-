import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { KotcLiveLayout } from "@/components/kotc-live/judge/KotcLiveLayout";
import { SudyamFormatWorkspace } from "@/components/sudyam/SudyamFormatWorkspace";
import {
  resolveSudyamBootstrap,
  SudyamBootstrapError,
} from "@/lib/sudyam-bootstrap";
import {
  buildSudyamLaunchUrl,
  getSingleSearchParam,
  parseSudyamLaunch,
  type SearchParamsShape,
  type SudyamFormat,
} from "@/lib/sudyam-launch";

export const metadata: Metadata = {
  title: "Sudyam | Lutyye Plyazhniki",
  description: "Unified judge workspace for IPT, KOTC, Round Robin, and Thai tournament flows.",
};

function resolveKotcUrl(host: string, proto: string): string {
  const configuredKotcUrl = String(process.env.NEXT_PUBLIC_KOTC_URL || "").trim();
  if (configuredKotcUrl && !(process.env.NODE_ENV === "production" && configuredKotcUrl.includes("localhost"))) {
    return configuredKotcUrl;
  }
  return host ? `${proto}://${host}/kotc/` : "/kotc/";
}

function buildKotcBaseUrl(host: string, proto: string): string {
  const kotcUrl = resolveKotcUrl(host, proto);

  try {
    const url = new URL(kotcUrl);
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return kotcUrl.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  }
}

function buildLegacyIframeSrc(
  host: string,
  proto: string,
  target?: { tournamentId?: string; format?: SudyamFormat | null },
): string {
  const siteUrl = host ? `${proto}://${host}/` : "/";
  const kotcUrl = resolveKotcUrl(host, proto);

  try {
    const url = new URL(kotcUrl);
    url.searchParams.set("siteUrl", siteUrl);
    url.searchParams.set("startTab", "roster");
    if (target?.tournamentId) {
      url.searchParams.set("legacyTournamentId", target.tournamentId);
    }
    if (target?.format) {
      url.searchParams.set("legacyFormat", target.format);
    }
    return url.toString();
  } catch {
    const sep = kotcUrl.includes("?") ? "&" : "?";
    const tail = [`siteUrl=${encodeURIComponent(siteUrl)}`, "startTab=roster"];
    if (target?.tournamentId) {
      tail.push(`legacyTournamentId=${encodeURIComponent(target.tournamentId)}`);
    }
    if (target?.format) {
      tail.push(`legacyFormat=${encodeURIComponent(target.format)}`);
    }
    return `${kotcUrl}${sep}${tail.join("&")}`;
  }
}

function getKotcNcFromSettings(settings: Record<string, unknown>): number | undefined {
  const parsed = Number(settings.courts ?? settings.nc ?? 0);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.max(1, Math.min(4, Math.floor(parsed)));
}

// Middleware already validates sudyam_session, so this route is authenticated.
export default async function SudyamPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLegacyOnly = getSingleSearchParam(resolvedSearchParams?.legacy).trim() === "1";
  const launch = parseSudyamLaunch(resolvedSearchParams);

  if (!launch.tournamentId) {
    const legacyIframeSrc = buildLegacyIframeSrc(host, proto);
    return <KotcLiveLayout legacyIframeSrc={legacyIframeSrc} initialLegacyMode={requestedLegacyOnly} />;
  }

  let payload;
  try {
    payload = await resolveSudyamBootstrap(launch.tournamentId, launch.format);
  } catch (error) {
    if (error instanceof SudyamBootstrapError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (launch.source === "legacy" || !launch.format || launch.format !== payload.format) {
    redirect(
      buildSudyamLaunchUrl({
        tournamentId: payload.tournamentId,
        format: payload.format,
      }),
    );
  }

  const legacyIframeSrc = buildLegacyIframeSrc(host, proto, {
    tournamentId: payload.tournamentId,
    format: payload.format,
  });
  const kotcBaseUrl = buildKotcBaseUrl(host, proto);

  if (payload.format === "thai" && payload.thaiJudgeLegacyUrl && (launch.forceLegacy || payload.thaiJudgeModule === "legacy")) {
    redirect(payload.thaiJudgeLegacyUrl);
  }

  if (payload.format === "kotc") {
    return (
      <KotcLiveLayout
        legacyIframeSrc={legacyIframeSrc}
        initialLegacyMode={launch.forceLegacy}
        targetTournamentId={payload.tournamentId}
        targetNc={getKotcNcFromSettings(payload.bootstrapState.settings)}
      />
    );
  }

  return (
    <SudyamFormatWorkspace
      data={payload}
      kotcBaseUrl={kotcBaseUrl}
      legacyIframeSrc={legacyIframeSrc}
      initialLegacyMode={launch.forceLegacy}
    />
  );
}
