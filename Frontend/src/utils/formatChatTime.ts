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

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora completas, para datos de la ficha: «14/03/2026 09:12». */
export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Última interacción en la ficha: «Hoy · 14:32», «Ayer · 16:20» o la fecha completa. */
export const formatActivityTime = (iso: string) => {
  const day = formatDayLabel(iso);
  if (day === 'Hoy' || day === 'Ayer') {
    const d = new Date(iso);
    return `${day} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return formatDateTime(iso);
};

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha corta para datos de la ficha: «12 mar 2026». */
export const formatShortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** Cuánto hace, a grandes rasgos: «hace 5 min», «hace 3 h», «hace 2 días». */
export const formatTimeAgo = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
};
