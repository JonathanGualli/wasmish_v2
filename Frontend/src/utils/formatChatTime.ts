/**
 * Hora de la lista de conversaciones: hoy da la hora, ayer dice «Ayer», y más
 * atrás la fecha corta. Igual que en la maqueta «Sidebar y Chats».
 */
export const formatChatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysApart = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000);

  if (daysApart <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (daysApart === 1) return 'Ayer';
  if (daysApart < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

/** Separador de día dentro de la conversación: «Hoy», «Ayer» o la fecha larga. */
export const formatDayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysApart = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000);

  if (daysApart <= 0) return 'Hoy';
  if (daysApart === 1) return 'Ayer';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long' });
};

/** Clave de día para agrupar mensajes. */
export const dayKey = (iso: string) => new Date(iso).toDateString();
