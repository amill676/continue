import react from "@vitejs/plugin-react-swc";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vitest/config";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Change the output .js filename to not include a hash
    rollupOptions: {
      // external: ["vscode-webview"],
      input: {
        index: path.resolve(__dirname, 'index.html'),
        mapping: path.resolve(__dirname, 'mapping.html'),
        inspect: path.resolve(__dirname, 'inspect.html'),
      },
      // Needed this or vite build failed
      // external: (id) => {
      //   // Mark all imports from '@inlet/web' as external
      //   return /^@inlet\/web\//.test(id);
      // },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/util/test/setupTests.ts",
  },
});
