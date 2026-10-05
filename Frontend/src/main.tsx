import ReactDOM from 'react-dom/client';
import App from './App.tsx'
import { QueryClientProvider, QueryClient  } from '@tanstack/react-query';
import { AppRouter } from './AppRouter.tsx';
import { AuthProvider } from './context/auth.context.provider.tsx';
import { NoticeProvider } from './components/Notice/context/NoticeContext.tsx';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SSEProvider } from './context/sse.provider.tsx';

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