import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { kesselPlugin } from "./server/kesselPlugin.ts";

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss(), kesselPlugin()],
  server: { host: "127.0.0.1" },
});
