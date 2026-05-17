/** URL to open the scanner on a phone (same Wi‑Fi in dev, current site in prod). */
export async function resolveMobileOpenUrl(): Promise<string> {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/__mobile-url");
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) return data.url;
      }
    } catch {
      /* dev server endpoint missing */
    }
  }

  const base = import.meta.env.BASE_URL || "/";
  return new URL(base, window.location.origin).href;
}
