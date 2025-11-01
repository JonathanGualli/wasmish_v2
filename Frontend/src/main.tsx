import ReactDOM from 'react-dom/client';
import App from './App.tsx'
import { QueryClientProvider, QueryClient  } from '@tanstack/react-query';
import { AppRouter } from './AppRouter.tsx';
import { AuthProvider } from './context/auth.context.provider.tsx';
import { ModalProvider } from './components/Modal/context/ModalContext.tsx';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ModalProvider>
        <App> 
          <AppRouter />
        </App>
      </ModalProvider>
    </AuthProvider>
  </QueryClientProvider>
)