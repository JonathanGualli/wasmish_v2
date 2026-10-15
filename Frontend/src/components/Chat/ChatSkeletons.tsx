import { useLines } from "../../hooks/useLines";
import { SkeletonBox, SkeletonField } from "../Skeleton/Skeleton";
import { SkeletonFrame } from "../Skeleton/SkeletonFrame";
import { SkeletonListRow } from "../Skeleton/SkeletonListRow";

const INBOX_ROWS = Array.from({ length: 10 }, (_, i) => i);
/** El avatar de la fila de la bandeja: 38 px, y 46 en el teléfono. */
const INBOX_AVATAR = 'w-[38px] h-[38px] rounded-[10px] max-md:w-[46px] max-md:h-[46px] max-md:rounded-xl';

/** La bandeja mientras carga: filas con las medidas de las reales y, con varias líneas, el sitio de su etiqueta. */
export const ConversationListSkeleton = () => {
    const { showLines } = useLines();
    return (
        <SkeletonFrame label="Cargando conversaciones">
            {INBOX_ROWS.map(i => (
                <SkeletonListRow key={i} index={i} avatar={INBOX_AVATAR} trailing="time" lineTag={showLines}
                    className="px-[18px] max-md:px-4 py-3.5 max-md:py-3 border-b border-brand-bg border-l-[3px] border-l-transparent" />
            ))}
        </SkeletonFrame>
    );
};

// Una conversación de verdad: los dos lados alternan, con su día encima (diseño 3.3).
const BUBBLES = [
    { kind: 'day' },
    { kind: 'theirs', className: 'w-[64%] md:w-[46%] h-[58px]' },
    { kind: 'mine', className: 'w-[72%] md:w-[52%] h-20' },
    { kind: 'day' },
    { kind: 'mine', className: 'w-[68%] md:w-[48%] h-20' },
    { kind: 'theirs', className: 'w-[58%] md:w-[40%] h-[58px]' },
    { kind: 'theirs', className: 'w-[36%] md:w-[24%] h-[38px]' },
] as const;

/** El hilo mientras llegan los mensajes. La cabecera y el cuadro de escribir ya están. */
export const ThreadSkeleton = () => (
    <SkeletonFrame label="Cargando mensajes" className="flex flex-col gap-3">
        {BUBBLES.map((bubble, i) => {
            if (bubble.kind === 'day') return <div key={i} className="self-center"><SkeletonBox className="w-16 h-[22px] rounded-full" /></div>;
            const mine = bubble.kind === 'mine';
            return (
                <div key={i} className={mine ? 'flex justify-end' : 'flex'}>
                    <SkeletonBox
                        tone={mine ? 'bubble-own' : 'bubble'}
                        className={`${bubble.className} ${mine ? 'rounded-[12px_12px_3px_12px]' : 'rounded-[12px_12px_12px_3px]'}`}
                    />
                </div>
            );
        })}
    </SkeletonFrame>
);

/**
 * Elegir plantilla mientras cargan (enviar plantilla y conversación nueva): el
 * selector cerrado de `TemplatePicker`, con su etiqueta, del alto del real. El
 * diseño dibuja una lista abierta, pero aquí es un selector.
 */
export const TemplateFormSkeleton = () => (
    <SkeletonFrame label="Cargando plantillas">
        <SkeletonField label="Plantilla" boxClassName="h-[46px] rounded-[8px]" />
    </SkeletonFrame>
);

