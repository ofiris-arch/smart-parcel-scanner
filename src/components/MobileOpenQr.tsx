import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { isMobileDevice } from "../lib/camera";
import { resolveMobileOpenUrl } from "../lib/mobileOpenUrl";

/** Desktop-only: QR + link to open the app on a phone. */
export function MobileOpenQr() {
  const [url, setUrl] = useState<string | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isMobileDevice()) return;

    let cancelled = false;
    void resolveMobileOpenUrl()
      .then(async (openUrl) => {
        if (cancelled) return;
        setUrl(openUrl);
        const dataUrl = await QRCode.toDataURL(openUrl, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrSrc(dataUrl);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not build QR");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isMobileDevice()) return null;

  return (
    <aside className="mobile-open-qr" aria-label="Open on phone">
      <p className="mobile-open-qr-title">Open on your phone</p>
      {qrSrc ? (
        <img
          className="mobile-open-qr-image"
          src={qrSrc}
          width={220}
          height={220}
          alt={url ? `QR code: ${url}` : "QR code for mobile URL"}
        />
      ) : (
        <div className="mobile-open-qr-placeholder" aria-hidden>
          …
        </div>
      )}
      {url && (
        <a className="mobile-open-qr-link" href={url}>
          {url}
        </a>
      )}
      {error && <p className="mobile-open-qr-error">{error}</p>}
      {import.meta.env.DEV && (
        <p className="mobile-open-qr-hint">Same Wi‑Fi · use https link · accept cert on iPhone</p>
      )}
    </aside>
  );
}
