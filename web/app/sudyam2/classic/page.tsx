import { headers } from "next/headers";
import { ClassicKotcMobileBridge } from "@/components/kotc-live/judge/ClassicKotcMobileBridge";
import { buildLegacyIframeSrc, buildLegacyJudgeAppSrc } from "@/lib/kotc-legacy";

export default async function Sudyam2ClassicPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");

  return (
    <ClassicKotcMobileBridge
      legacyAppSrc={buildLegacyJudgeAppSrc(host, proto)}
      fallbackHref={buildLegacyIframeSrc(host, proto)}
    />
  );
}
