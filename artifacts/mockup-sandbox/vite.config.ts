import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";
import {
  parseAllowedHosts,
  parsePort,
  resolveApiProxyTarget,
} from "./vite.config.helpers";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ mode, command }) => {
  // Only load the public Vite variables and explicitly server-side API settings.
  const env = loadEnv(mode, configDir, ["VITE_", "API_"]);
  const port = parsePort(process.env.PORT, 4173);
  const allowedHosts = parseAllowedHosts(env.VITE_ALLOWED_HOSTS);
  const apiProxyTarget = resolveApiProxyTarget(
    env.API_PROXY_TARGET,
    env.API_PORT,
  );
  const isReplitDev = command === "serve" && Boolean(process.env.REPL_ID);

  const replitPlugins = isReplitDev
    ? [
        (await import("@replit/vite-plugin-runtime-error-modal")).default(),
        (
          await import("@replit/vite-plugin-cartographer")
        ).cartographer({ root: path.resolve(configDir, "..") }),
      ]
    : [];

  return {
    base: process.env.BASE_PATH || "/",
    plugins: [
      mockupPreviewPlugin(),
      react(),
      tailwindcss(),
      ...replitPlugins,
    ],
    resolve: {
      alias: {
        "@": path.resolve(configDir, "src"),
      },
    },
    root: configDir,
    build: {
      outDir: path.resolve(configDir, "dist"),
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: false,
      esbuild: {
        drop: mode === "production" ? ["debugger"] : [],
      },
    },
    server: {
      port,
      host: "0.0.0.0",
      allowedHosts,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
