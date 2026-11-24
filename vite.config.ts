import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { kesselPlugin } from "./server/kesselPlugin.ts";
import { plannerServicePlugin } from "./server/service/plugin.ts";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss(), kesselPlugin(), plannerServicePlugin()],
  server: {
    host: "127.0.0.1",
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/.room-planner/**",
        "**/.wrangler/**",
        "**/service.sqlite*",
      ],
    },
  },
});
