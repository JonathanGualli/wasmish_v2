import { Home, Menu, Rocket, Settings, MessageSquare } from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { useLocation, useNavigate } from "react-router-dom";
import { AppRoutes } from "../../models/routes.models";
import { useEffect, useMemo, useState } from "react";


interface Props {
    collapsed: boolean,
    toggle: () => void,
}

interface handleButtonProps {
    value: string,
    path: string,
}

export const Sidebar = ({ collapsed, toggle }: Props) => {

    const navigate = useNavigate();
    const location = useLocation();
    const [valueSelected, setValueSelected] = useState("");

    const items = useMemo(() => [
        { icon: <Rocket />, text: "Inicio Rápido", value: "quickStart", path: `${AppRoutes.private.root}/${AppRoutes.private.quickStart}` },
        { icon: <Home />, text: "Dashboard", value: "dashboard", path: `${AppRoutes.private.root}/${AppRoutes.private.dashboard}` },
        { icon: <MessageSquare />, text: "Chats", value: "chats", path: `${AppRoutes.private.root}/${AppRoutes.private.chats}` },
        { icon: <Settings />, text: "Ajustes", value: "settings", path: `${AppRoutes.private.root}/${AppRoutes.private.settings}` },
    ], []);

    const handleButton = ({ value, path }: handleButtonProps) => {
        setValueSelected(value);
        navigate(path);
    }

    useEffect(() => {
        const currentItem = items.find(item => location.pathname === item.path);
        if(currentItem) {
            setValueSelected(currentItem.value);
        }
    }, [location.pathname, items]); 

    return (
        <div
            className={`bg-white border-r shadow h-screen transition-all ${collapsed ? "w-15" : "w-58"}`}>

            <div className="flex items-center justify-between p-4">
                {!collapsed && <span className="font-bold">Logo</span>}
                <button onClick={toggle}>
                    <Menu size={20} />
                </button>
            </div>

            <nav className="mt-4">
                {items.map(({ icon, text, value, path }) => (
                    <SidebarItem
                        key={value}
                        icon={icon}
                        text={text}
                        collapsed={collapsed}
                        onTap={() => handleButton({ value, path })}
                        isSelected={valueSelected === value}
                    />
                ))}
            </nav>
        </div>
    );
};