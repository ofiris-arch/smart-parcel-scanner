import type { ScanResult } from "../lib/types";

interface ResultViewProps {
  result: ScanResult;
  onScanAgain: () => void;
}

export function ResultView({ result, onScanAgain }: ResultViewProps) {
  const copy = () => {
    void navigator.clipboard.writeText(result.barcode);
  };

  const verified = result.matched === true;

  return (
    <div className="result">
      <header>
        <h1>{verified ? "Verified" : "Scan result"}</h1>
        <p className="meta">
          Barcode: {result.barcodeDetectionMs ?? "—"} ms
          {" · "}
          Printed: {result.printedDetectionMs ?? "—"} ms
          {" · "}
          Total: {result.processingMs} ms
          {result.accuracyPercent != null &&
            ` · Accuracy: ${result.accuracyPercent}%`}
        </p>
      </header>

      <section
        className={`verify-banner ${verified ? "verify-banner--ok" : "verify-banner--bad"}`}
      >
        {verified ? "Barcode matches printed number" : "Verification incomplete"}
      </section>

      <section className="barcode-result">
        <span className="barcode-value">{result.barcode}</span>
        <button type="button" className="secondary" onClick={copy}>
          Copy barcode
        </button>
      </section>

      {result.fields.length > 0 && (
        <section className="kv-table-wrap">
          <table className="kv-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {result.fields.map((row) => (
                <tr
                  key={row.key}
                  className={row.highlight ? `row-${row.highlight}` : undefined}
                >
                  <th scope="row">{row.key}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <button type="button" onClick={onScanAgain}>
        Scan another parcel
      </button>
    </div>
  );
}
