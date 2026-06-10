import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// https://remix.run/docs/en/main/future/vite
export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: true,
  },
  optimizeDeps: {
    include: ["@shopify/polaris"],
  },
});
