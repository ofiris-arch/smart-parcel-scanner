import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";

const LOG_FILE = path.join(process.cwd(), ".cursor", "scanner-live.jsonl");

function lanIPv4Addresses(): string[] {
  const ips: string[] = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

/** Dev-only: append scan events so Cursor can tail `.cursor/scanner-live.jsonl`. */
export function scanLogPlugin(): Plugin {
  return {
    name: "parcel-scan-log",
    configureServer(server) {
      server.middlewares.use("/__mobile-url", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }

        const port = server.config.server.port ?? 5173;
        const https = Boolean(server.config.server.https);
        const protocol = https ? "https" : "http";
        const urls = lanIPv4Addresses().map(
          (ip) => `${protocol}://${ip}:${port}/`,
        );
        const url =
          urls[0] ?? `${protocol}://localhost:${port}/`;

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ url, urls }));
      });

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
