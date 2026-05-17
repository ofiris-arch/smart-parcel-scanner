import { SCAN_CONFIG } from "./scanConfig";

export interface BarcodeStabilityState {
  stable: boolean;
  value: string;
  streak: number;
}

/** Tracks consecutive preview frames with the same decoded barcode. */
export class BarcodeStabilityTracker {
  private last = "";
  private streak = 0;

  reset(): void {
    this.last = "";
    this.streak = 0;
  }

  note(barcode: string | null | undefined): BarcodeStabilityState {
    const value = barcode?.trim() ?? "";
    if (!value) {
      this.reset();
      return { stable: false, value: "", streak: 0 };
    }

    if (value === this.last) {
      this.streak += 1;
    } else {
      this.last = value;
      this.streak = 1;
    }

    return {
      stable: this.streak >= SCAN_CONFIG.barcodeStableFrames,
      value,
      streak: this.streak,
    };
  }
}
