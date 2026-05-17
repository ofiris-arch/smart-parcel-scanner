import type { ScanDeviceInfo } from "../lib/deviceInfo";

interface MobileCapabilitiesProps {
  deviceInfo: ScanDeviceInfo;
  torchSupported: boolean;
}

export function MobileCapabilities({
  deviceInfo,
  torchSupported,
}: MobileCapabilitiesProps) {
  const mobile = /android|iphone|ipad|ipod/i.test(deviceInfo.userAgent);

  return (
    <div className="mobile-capabilities" role="status">
      <span className={mobile ? "cap cap-ok" : "cap"}>
        {mobile ? "Mobile" : "Desktop preview"}
      </span>
      <span className={deviceInfo.textDetector ? "cap cap-ok" : "cap cap-warn"}>
        Native OCR: {deviceInfo.textDetector ? "yes" : "no"}
      </span>
      <span className={torchSupported ? "cap cap-ok" : "cap cap-warn"}>
        Flash: {torchSupported ? "yes" : "no"}
      </span>
      <span
        className={deviceInfo.secureContext ? "cap cap-ok" : "cap cap-warn"}
      >
        HTTPS: {deviceInfo.secureContext ? "yes" : "no"}
      </span>
    </div>
  );
}
