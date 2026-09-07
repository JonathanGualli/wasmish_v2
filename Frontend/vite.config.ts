import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // La versión que se ve en la UI sale de package.json y se congela aquí, en
  // tiempo de compilación: es la del bundle que el navegador tiene cargado.
  // Así solo hay un sitio que tocar al publicar (ver npm run version:bump).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Permitir que nfrok sirva la app 
    allowedHosts: ['subzonary-rosalba-untoned.ngrok-free.dev'],
    // Reenviar las llamadas /api al backend local
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
