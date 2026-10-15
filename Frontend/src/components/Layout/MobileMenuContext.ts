import { createContext, useContext } from "react";

/**
 * Abrir el menú lateral en el teléfono desde una página que no lleva la barra de
 * la app: Chats pone su propio ☰ (diseño E1). `null` fuera del teléfono.
 */
export const MobileMenuContext = createContext<(() => void) | null>(null);

export const useOpenMobileMenu = () => useContext(MobileMenuContext);
