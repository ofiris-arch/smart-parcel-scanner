import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { scanLogPlugin } from "./vite-scan-log-plugin";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const forGitHubPages =
  process.env.GITHUB_PAGES === "true" && Boolean(repoName);

export default defineConfig(({ command }) => ({
  base: forGitHubPages ? `/${repoName}/` : "/",
  optimizeDeps: {
    exclude: ["zxing-wasm"],
  },
  plugins: [
    ...(command === "serve" ? [basicSsl()] : []),
    ...(command === "serve" ? [scanLogPlugin()] : []),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["sample-label.png"],
      manifest: {
        name: "Smart Parcel Scanner",
        short_name: "ParcelScan",
        description: "Scan parcel labels while redacting personal details",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
      },
    }),
  ],
  server: {
    host: true,
    headers: {
      "Permissions-Policy": "camera=(self)",
    },
  },
}));
