import Constants from "expo-constants";

export const CMP_API_URL: string =
  (Constants.expoConfig?.extra?.cmpApiUrl as string | undefined)?.replace(/\/$/, "") ||
  process.env.EXPO_PUBLIC_CMP_API_URL?.replace(/\/$/, "") ||
  "http://wingyip.axoncase.com:3102";

export function resolveCmpAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    try {
      const url = new URL(pathOrUrl);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        const base = new URL(CMP_API_URL);
        url.protocol = base.protocol;
        url.host = base.host;
        return url.toString();
      }
      return pathOrUrl;
    } catch {
      return pathOrUrl;
    }
  }
  const base = CMP_API_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function localeHeader(locale: string): string {
  return locale === "zh-Hant" ? "zh" : "en";
}
