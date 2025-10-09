import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
const isGithubPages = readGithubPagesFlag()
const base =  '/'


const assetsPath = '/src/assets' 

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@assets': assetsPath
    }
  },
  base,
  build: {
    sourcemap: false,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[ext]' 
      }
    }
  }
})
