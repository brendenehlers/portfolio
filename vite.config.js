import { defineConfig } from "vite"
import { terser } from "rollup-plugin-terser"

export default defineConfig({
  // Specify the directory containing your JavaScript files
  root: './',
  base: '',
  // Build configuration
  build: {
    // Output directory for the built files
    outDir: 'dist',
    // Emit manifest.json for PWA
    manifest: false,
    // Minify HTML and CSS files in production
    minify: 'esbuild',
    rollupOptions: {
      plugins: [terser()]
    }
  },
})