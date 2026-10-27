import type { ReactNode } from "react";
import { Smartphone } from "lucide-react";

/**
 * Bajo el campo de nombre, si está vacío y el contacto tiene nombre en la
 * agenda del celular: que se entienda que es ese el que se usa.
 */
export const AgendaNameHint = ({ children }: { children: ReactNode }) => (
    <span className="flex gap-1.5 text-brand-gray-600">
        <Smartphone size={12} strokeWidth={2.2} className="flex-none mt-0.5" />
        <span>{children}</span>
    </span>
);
