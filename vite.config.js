import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  // Specify the directory containing your JavaScript files
  root: './',
  base: '',
  plugins: [tailwindcss()],
  // Build configuration
  build: {
    // Output directory for the built files
    outDir: 'dist',
    // Emit manifest.json for PWA
    manifest: false,
  },
})
