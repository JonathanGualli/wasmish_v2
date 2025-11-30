import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "../Sidebar/Sidebar";
import { useAuthContext } from "../../context/auth.context";
import { Menu } from "lucide-react";

export const PrivateLayout = ({children}: {children: ReactNode}) => {

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const { logOut } = useAuthContext();

    useEffect(() => {
        const checkSize = () => {
            setIsMobile(window.innerWidth < 768);
            if(window.innerWidth < 768) setIsCollapsed(true);
        }

        checkSize();
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <Sidebar collapsed={isCollapsed} toggle={() => setIsCollapsed(!isCollapsed)} isMobile={isMobile} />
            
            {/* Si es mobile y el sidebar está abierto -> bloquea el dongo */}
            {isMobile && !isCollapsed && (
                <div 
                    className="fixed inset-0 bg-black/40 z-40"
                    onClick={() => setIsCollapsed(true)}
                ></div>
            )}


            {/* Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Hader */}
                <header className="h-14 bg-white shadow flex items-center justify-between px-4">
                    <div className="flex flex-row gap-4 items-center">
                        {/* botón para abrir en menú en mobile */}
                        {isMobile && (
                        <button className="md:hidden px-2 py-1 bg-gray-200 rounded" onClick={ () => setIsCollapsed(false)}>
                            <Menu size={20} />
                        </button>
                    )}
                    <h1 className="text-lg font-bold">Wasmish</h1>
                    </div>
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