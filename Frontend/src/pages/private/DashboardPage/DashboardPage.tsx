import { useAuthContext } from "../../../context/auth.context";

export const DashboardPage = () => {

    const { user } = useAuthContext();

    return (
        <div>
            <h1>Dashboard</h1>
            <p>Bienvenido al Dashboard privado {user?.name}</p>
        </div>
    );
}