import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppRoutes } from "../models/routes.models";
import type { LoginNavigationState } from "../models/routes.models";
import { useAuthContext } from "../context/auth.context";
import { useDelayedLoading } from "../hooks/useDelayedLoading";
import { AppBootSkeleton } from "../components/Skeleton/AppBootSkeleton";

export const PrivateGuard = () => {
  const { user, isLoading } = useAuthContext();
  const location = useLocation();
  const { pending, visible } = useDelayedLoading(isLoading);

  // Mientras se comprueba la sesión, el marco de Wasmish (no una página en blanco).
  if (pending) return <AppBootSkeleton visible={visible} />;
  console.log("PrivateGuard: Verifying login status");
  // Sin sesión, al login, que después vuelve aquí (p. ej. al tocar el aviso de
  // un mensaje con la sesión caducada: entra y abre esa conversación).
  if (!user) {
    const state: LoginNavigationState = { from: location.pathname + location.search };
    return <Navigate to={AppRoutes.login} replace state={state} />;
  }

  return <Outlet />;
};
