import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { KotcLiveLayout } from '@/components/kotc-live/judge/KotcLiveLayout';

export const metadata: Metadata = {
  title: 'Судьям | Лютые Пляжники (New)',
  description: 'Приложение судьи King of the Court — управление кортами, таблицами и таймерами.',
};

function buildLegacyIframeSrc(host: string, proto: string): string {
  const siteUrl = host ? `${proto}://${host}/` : "/";
  const configuredKotcUrl = String(process.env.NEXT_PUBLIC_KOTC_URL || "").trim();
  const kotcUrl =
    configuredKotcUrl && !(process.env.NODE_ENV === "production" && configuredKotcUrl.includes("localhost"))
      ? configuredKotcUrl
      : host
        ? `${proto}://${host}/kotc/`
        : "/kotc/";

  try {
    const url = new URL(kotcUrl);
    url.searchParams.set("siteUrl", siteUrl);
    url.searchParams.set("startTab", "roster");
    return url.toString();
  } catch {
    const sep = kotcUrl.includes("?") ? "&" : "?";
    return `${kotcUrl}${sep}siteUrl=${encodeURIComponent(siteUrl)}&startTab=roster`;
  }
}

// Middleware уже проверил PIN — если мы здесь, доступ разрешён
export default async function Sudyam2Page() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const proto = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const legacyIframeSrc = buildLegacyIframeSrc(host, proto);

  return <KotcLiveLayout legacyIframeSrc={legacyIframeSrc} />;
}
