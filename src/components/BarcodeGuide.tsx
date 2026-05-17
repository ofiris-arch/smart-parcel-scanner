/** Static guide: aim the barcode strip inside this horizontal band. */
export function BarcodeGuide() {
  return (
    <svg
      className="barcode-guide"
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x="6"
        y="22"
        width="88"
        height="28"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="0.5"
      />
      <text x="50" y="18" textAnchor="middle" className="barcode-guide-label">
        Align barcode here
      </text>
    </svg>
  );
}
