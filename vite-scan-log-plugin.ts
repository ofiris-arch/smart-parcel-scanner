import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const LOG_FILE = path.join(process.cwd(), ".cursor", "scanner-live.jsonl");

/** Dev-only: append scan events so Cursor can tail `.cursor/scanner-live.jsonl`. */
export function scanLogPlugin(): Plugin {
  return {
    name: "parcel-scan-log",
    configureServer(server) {
      server.middlewares.use("/__scan-log", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
            const line = body.trim();
            if (line) fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}
