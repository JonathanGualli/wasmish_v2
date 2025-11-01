import type { ReactNode } from "react";

interface Props {
    icon: ReactNode,
    text: string,
    collapsed: boolean,
    onTap: () => void,
    isSelected: boolean,
}


export const SidebarItem = ({icon, text, collapsed, onTap, isSelected}: Props) => {
    return(
        <button onClick={onTap} type="button" className={`flex items-center gap-3 px-4 py-2 w-full ${isSelected ? "bg-cyan-400" : "hover:bg-gray-100 cursor-pointer" }`}>
            {icon}
            {!collapsed && <span>{text}</span>}
        </button>
    );
}