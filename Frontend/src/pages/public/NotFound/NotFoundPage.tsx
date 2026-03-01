import { Link } from "react-router-dom";
import { CustomButton } from "../../../components/Button/Button";
import { AppRoutes } from "../../../models/routes.models";

export default function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300">
      <div className="text-center px-6 py-12 bg-white shadow-xl rounded-3xl">
        <h1 className="text-9xl font-extrabold text-gray-900 mb-4 animate-bounce pt-10">404</h1>
        <h2 className="text-2xl md:text-3xl font-semibold mb-4 text-gray-700">
          ¡Oops! Página no encontrada
        </h2>
        <p className="text-gray-600 mb-6">
          La página que buscas no existe o ha sido movida.
        </p>
        <Link to={AppRoutes.login}>
          <CustomButton color="blue">Volver al Inicio</CustomButton>
        </Link>
         
      </div>
    </div>
  );
}
