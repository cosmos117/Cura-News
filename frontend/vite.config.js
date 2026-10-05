import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // esbuild is bundled with Vite. The previous value was 'terser' with
    // terser not installed, so `npm run build` failed outright.
    minify: "esbuild",
    // Split the large icon library out of the main bundle.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});