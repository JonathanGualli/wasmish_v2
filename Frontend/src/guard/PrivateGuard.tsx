import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppRoutes } from "../models/routes.models";
import type { LoginNavigationState } from "../models/routes.models";
import { useAuthContext } from "../context/auth.context";

export const PrivateGuard = () => {
  const { user, isLoading } = useAuthContext();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-dvh">
        <p className="text-lg text-gray-500">Cargando...</p>
      </div>
    );
  }
  console.log("PrivateGuard: Verifying login status");
  // Sin sesión, al login, que después vuelve aquí (p. ej. al tocar el aviso de
  // un mensaje con la sesión caducada: entra y abre esa conversación).
  if (!user) {
    const state: LoginNavigationState = { from: location.pathname + location.search };
    return <Navigate to={AppRoutes.login} replace state={state} />;
  }

  return <Outlet />;
};
