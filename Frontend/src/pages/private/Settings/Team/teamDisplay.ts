import type { AssignableRole, TeamInvitation } from "../../../../models/team.model";
import { AppRoutes } from "../../../../models/routes.models";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días enteros desde hoy hasta `iso` (negativo si ya pasó). */
const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);

/** «Caduca en 5 días», «Caduca mañana», «Caduca hoy». `soon`: le queda un día o menos. */
export const expiryText = (expiresAt: string) => {
    const days = daysUntil(expiresAt);
    if (days <= 0) return { text: 'Caduca hoy', soon: true };
    if (days === 1) return { text: 'Caduca mañana', soon: true };
    return { text: `Caduca en ${days} días`, soon: false };
};

/** «Invitó Jonathan Gualli · hace 2 días». */
export const invitedText = (invitation: TeamInvitation) => {
    const days = daysSince(invitation.createdAt);
    const when = days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    return invitation.invitedByName ? `Invitó ${invitation.invitedByName} · ${when}` : `Invitada ${when}`;
};

/** Qué hace cada rol, en el diálogo de invitar o cambiar (diseño: marco 2c). */
export const ROLE_OPTIONS: { role: AssignableRole; label: string; description: string }[] = [
    { role: 'admin', label: 'Admin', description: 'Todas las líneas. Gestiona líneas, API keys y el equipo.' },
    { role: 'supervisor', label: 'Supervisor', description: 'Sus líneas. Campañas, contactos, etiquetas y plantillas.' },
    { role: 'agent', label: 'Agente', description: 'Sus líneas. Responde chats y edita contactos.' },
];

export const usersText = (count: number) => `${count} ${count === 1 ? 'usuario' : 'usuarios'}`;

/** «Tu plan permite 5 usuarios. Desactiva a alguien…» (el mismo texto del backend). */
export const userLimitText = (maxUsers: number) =>
    `Tu plan permite ${usersText(maxUsers)}. Desactiva a alguien o anula una invitación, o pide más usuarios.`;

/** El enlace de la invitación: el frontend lo arma con su propio origen. */
export const invitationUrl = (token: string) => `${window.location.origin}${AppRoutes.invite}/${token}`;
