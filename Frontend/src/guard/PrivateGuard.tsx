import { Navigate, Outlet } from "react-router-dom";
import { useAuthContext } from "../context/auth.context";

export const PrivateGuard = () => {
  const { user, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg text-gray-500">Cargando...</p>
      </div>
    );
  }
  console.log("PrivateGuard: Verifying login status");
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
};
