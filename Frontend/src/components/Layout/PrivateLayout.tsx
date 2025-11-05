import { useState, type ReactNode } from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { useAuthContext } from "../../context/auth.context";

export const PrivateLayout = ({children}: {children: ReactNode}) => {

    const [isCollapsed, setIsCollapsed] = useState(false);
    const { logOut } = useAuthContext();

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <Sidebar collapsed={isCollapsed} toggle={() => setIsCollapsed(!isCollapsed)} />
            
            {/* Content */}
            <div className="flex-1 flex flex-col">
                {/* Hader */}
                <header className="h-14 bg-white shadow flex items-center justify-between px-4">
                    <h1 className="text-lg font-bold">Wasmish</h1>
                    <button type="button" className="cursor-pointer text-red-600" onClick={logOut}>Cerrar Sesión</button>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>

        </div>
    );
}