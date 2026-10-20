import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Message } from '../../models/message.mode';

/**
 * Mensajes eliminados y editados (coexistencia): lo borró o lo editó el contacto,
 * o el negocio desde la app de WhatsApp Business. La burbuja dice «Mensaje
 * eliminado» o lleva «Editado» junto a la hora, y el ojo enseña lo que decía.
 * Lo abierto es de esta pantalla: ni se guarda ni se comparte entre pestañas.
 */

const formatTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** El ojo, en la línea de la hora. Con el área de toque de 44 px en el teléfono. */
export const MessageChangeToggle = ({ msg, open, onToggle }: { msg: Message; open: boolean; onToggle: () => void }) => {
    const label = msg.deletedAt
        ? (open ? 'Ocultar el mensaje original' : 'Ver el mensaje original')
        : (open ? 'Ocultar las versiones anteriores' : 'Ver las versiones anteriores');
    const Icon = open ? EyeOff : Eye;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={label}
            aria-expanded={open}
            title={label}
            className="relative inline-flex items-center justify-center rounded-[6px] p-0.5 text-brand-muted
                transition-colors hover:text-brand-text hover:bg-brand-raised
                max-md:after:absolute max-md:after:-inset-[13px] max-md:after:content-['']"
        >
            <Icon size={14} />
        </button>
    );
};

const PanelLabel = ({ children }: { children: ReactNode }) => (
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">{children}</span>
);

/**
 * Lo que enseña el ojo, bajo la burbuja: en un eliminado, su contenido tal cual
 * (`renderBody`, el mismo cuerpo que la burbuja, con el archivo si lo hay); en un
 * editado, las versiones anteriores de la más reciente a la más antigua, cada una
 * con su hora. Eliminado y editado: las dos cosas.
 */
export const MessageChangeDetails = ({ msg, renderBody }: { msg: Message; renderBody: (msg: Message) => ReactNode }) => {
    const versions = [...(msg.previousVersions ?? [])].reverse();
    return (
        <div className="mt-1.5 flex flex-col gap-2.5 rounded-[10px] border border-dashed border-brand-border-strong
            bg-brand-surface px-3.5 py-2.5 text-sm max-md:text-[15px] leading-[1.5] text-brand-text">
            {msg.deletedAt && (
                <div className="flex flex-col gap-1">
                    <PanelLabel>Eliminado</PanelLabel>
                    <div className="whitespace-pre-line [overflow-wrap:anywhere]">{renderBody(msg)}</div>
                </div>
            )}
            {versions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <PanelLabel>{versions.length === 1 ? 'Versión anterior' : 'Versiones anteriores'}</PanelLabel>
                    {versions.map((version, i) => (
                        <div key={`${i}-${version.editedAt}`} className="flex flex-col">
                            <span className="whitespace-pre-line [overflow-wrap:anywhere] text-brand-strong">
                                {version.caption ?? version.text}
                            </span>
                            <span className="font-mono text-[11px] text-brand-subtle">{formatTime(version.editedAt)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
