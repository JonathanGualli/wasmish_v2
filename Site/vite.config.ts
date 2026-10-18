import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// La página pública. `npm run build` compila dos veces (el navegador y el SSR)
// y scripts/prerender.mjs escribe el HTML de cada página: ver
// docs/arquitectura/pagina-publica.md.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
