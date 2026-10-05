import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

import pkg from './package.json'

// Lo poco que se usa del proxy de Vite. Sin @types/node (el proyecto no lo
// necesita para nada más) sus eventos no vienen tipados.
type ProxyWithEvents = {
  on(event: 'proxyRes', listener: (
    proxyRes: { on(event: 'close', listener: () => void): void },
    req: unknown,
    res: { writableEnded: boolean; destroy(): void },
  ) => void): void
}

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
        // Si el backend se cae a media respuesta (nodemon reinicia), cortar
        // también la del navegador. Sin esto la conexión SSE queda abierta sin
        // recibir nada: el navegador no se entera, no reconecta y la app se
        // queda sin tiempo real hasta recargar.
        configure: (proxy) => {
          (proxy as unknown as ProxyWithEvents).on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => {
              if (!res.writableEnded) res.destroy();
            });
          });
        },
      }
    }
  }
})
