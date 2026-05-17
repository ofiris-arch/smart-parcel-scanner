import { isNativeTextDetectionAvailable } from "./shapeText";

export interface ScanDeviceInfo {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemoryGb?: number;
  textDetector: boolean;
  torchLikely: boolean;
  secureContext: boolean;
  protocol: string;
}

export function getScanDeviceInfo(): ScanDeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
    deviceMemoryGb: nav.deviceMemory,
    textDetector: isNativeTextDetectionAvailable(),
    torchLikely: /android|iphone|ipad/i.test(navigator.userAgent),
    secureContext: window.isSecureContext,
    protocol: window.location.protocol,
  };
}
