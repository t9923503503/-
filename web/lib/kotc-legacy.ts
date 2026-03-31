export function shouldUseClassicMobile(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

function resolveKotcBase(host: string, proto: string): URL {
  const configuredKotcUrl = String(process.env.NEXT_PUBLIC_KOTC_URL || "").trim();
  const kotcUrl =
    configuredKotcUrl && !(process.env.NODE_ENV === "production" && configuredKotcUrl.includes("localhost"))
      ? configuredKotcUrl
      : host
        ? `${proto}://${host}/kotc/`
        : "/kotc/";

  if (host) {
    return new URL(kotcUrl, `${proto}://${host}`);
  }

  return new URL(kotcUrl, "https://lpvolley.ru");
}

export function buildLegacyIframeSrc(host: string, proto: string): string {
  const siteUrl = host ? `${proto}://${host}/` : "/";
  const url = resolveKotcBase(host, proto);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  url.searchParams.set("siteUrl", siteUrl);
  url.searchParams.set("startTab", "roster");
  return url.toString();
}

export function buildLegacyJudgeAppSrc(host: string, proto: string): string {
  const siteUrl = host ? `${proto}://${host}/` : "/";
  const url = resolveKotcBase(host, proto);
  url.pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : `${url.pathname}/index.html`;
  url.search = "";
  url.hash = "";
  url.searchParams.set("siteUrl", siteUrl);
  return url.toString();
}
