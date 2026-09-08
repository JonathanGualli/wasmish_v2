import {
  Image, Video, Mic, FileText, Sticker, MapPin, User,
  SmilePlus, CornerUpLeft, ShoppingBag, CircleHelp,
} from 'lucide-react';
import type { MessageType } from '../../models/message.mode';

/**
 * Icono que acompaña al texto de un mensaje que no es texto plano.
 *
 * Devuelve `null` para 'text', que es la inmensa mayoría del historial: así la
 * burbuja normal no cambia en nada. Un tipo que Meta invente mañana cae en el
 * interrogante en vez de quedarse sin nada delante.
 *
 * Iconos a 15px: el manual pide 16 para acciones, pero aquí acompañan a texto
 * de 14 y a esa escala 16 pesa más que la propia frase.
 */
const ICONOS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  audio: Mic,
  document: FileText,
  sticker: Sticker,
  location: MapPin,
  contacts: User,
  reaction: SmilePlus,
  // Respuesta a un botón o a un menú: la flecha dice «esto contestó a lo tuyo».
  button: CornerUpLeft,
  interactive: CornerUpLeft,
  order: ShoppingBag,
};

export const MessageTypeIcon = ({ type }: { type?: MessageType }) => {
  if (!type || type === 'text') return null;

  const Icono = ICONOS[type] ?? CircleHelp;
  return <Icono size={15} strokeWidth={2} className="flex-none" />;
};
