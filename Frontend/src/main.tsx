import ReactDOM from 'react-dom/client';
import App from './App.tsx'
import { QueryClientProvider, QueryClient  } from '@tanstack/react-query';
import { AppRouter } from './AppRouter.tsx';
import { AuthProvider } from './context/auth.context.provider.tsx';
import { NoticeProvider } from './components/Notice/context/NoticeContext.tsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SSEProvider } from './context/sse.provider.tsx';
import { registerServiceWorker } from './libs/serviceWorker.ts';
import { captureInstallPrompt } from './libs/installPrompt.ts';
import { trackVisualViewport } from './libs/viewport.ts';

// App instalable y avisos push (app móvil). Tras el `load`, para no competir
// con la carga de la página.
window.addEventListener('load', () => { void registerServiceWorker(); });
// Antes de pintar nada: Chrome ofrece instalar una sola vez, al cargar.
captureInstallPrompt();
// El alto de la app con el teclado del teléfono abierto.
trackVisualViewport();

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SSEProvider>
        <NoticeProvider>
          <App> 
            <AppRouter />
          </App>
        </NoticeProvider>
      </SSEProvider>
    </AuthProvider>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)