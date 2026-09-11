import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5175,
    watch: {
      ignored: ["**/likec4/**", "**/dist/**", "**/node_modules/**"],
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:18084", changeOrigin: true },
      "/images": { target: "http://127.0.0.1:18084", changeOrigin: true },
      "/likec4": { target: "http://127.0.0.1:18084", changeOrigin: true },
    },
  },
  plugins: [tailwindcss(), react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
