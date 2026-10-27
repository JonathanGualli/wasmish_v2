import { useState, type ReactNode } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { ArrowRight, ChevronLeft, CircleHelp } from "lucide-react";
import { CustomButton } from "../../../../components/Button/Button";
import { PHONE_QUERY, useMediaQuery } from "../../../../hooks/useMediaQuery";

type Answer = 'yes' | 'no';

interface Props {
    open: boolean;
    /** «Volver a conectar» una línea que estaba junto con la app abre ya en «Sí». */
    initialAnswer?: Answer | null;
    onCancel: () => void;
    /** `businessApp`: el número sigue en la app de WhatsApp Business (coexistencia). */
    onConnect: (businessApp: boolean) => void;
}

/** Una de las dos respuestas: tarjeta con su radio. */
const Option = ({ checked, title, hint, onSelect }: { checked: boolean; title: string; hint: string; onSelect: () => void }) => (
    <label className={`flex items-start gap-3 rounded-[10px] border px-3.5 py-3 cursor-pointer transition-colors
        ${checked ? 'border-brand-success bg-brand-green-50' : 'border-brand-border bg-brand-surface hover:bg-brand-bg'}`}>
        <input type="radio" name="business-app" checked={checked} onChange={onSelect} className="sr-only" />
        <span aria-hidden className={`mt-0.5 flex-none w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center
            ${checked ? 'border-brand-deep' : 'border-brand-border-strong'}`}>
            {checked && <span className="w-2 h-2 rounded-full bg-brand-deep" />}
        </span>
        <span className="min-w-0">
            <span className="block text-sm font-semibold text-brand-text">{title}</span>
            <span className="block mt-0.5 text-[13px] leading-[1.5] text-brand-gray-600">{hint}</span>
        </span>
    </label>
);

/** Un grupo de la explicación del «Sí»: su etiqueta y sus puntos. */
const Group = ({ label, labelClass, dotClass, items }: { label: string; labelClass: string; dotClass: string; items: ReactNode[] }) => (
    <div className="grid gap-2">
        <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${labelClass}`}>{label}</p>
        <ul className="grid gap-2">
            {items.map((item, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-[1.55] text-brand-gray-600">
                    <span aria-hidden className={`mt-[7px] flex-none w-1.5 h-1.5 rounded-[1px] ${dotClass}`} />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    </div>
);

const Strong = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-brand-text">{children}</strong>;

/**
 * Antes de abrir Facebook, «Conectar WhatsApp» pregunta si el número está en la
 * app de WhatsApp Business (coexistencia): con «No», el camino de siempre; con
 * «Sí», qué sigue igual, qué cambia y qué hace falta. Diseño: «Wasmish Líneas -
 * Junto con la app» (1a–1e, m1–m2), con los textos del spec (2026-10-16); los
 * chats y la agenda que se traen al conectar, de «Wasmish Líneas - Chats de la
 * app» (1a), con lo que salió al probarlo con Meta: los archivos que mandó el
 * negocio no llegan.
 */
export const ConnectQuestion = ({ open, initialAnswer = null, onCancel, onConnect }: Props) => {
    const isPhone = useMediaQuery(PHONE_QUERY);
    const [answer, setAnswer] = useState<Answer | null>(initialAnswer);
    const [step, setStep] = useState<'question' | 'explain'>('question');

    const close = () => {
        setAnswer(initialAnswer);
        setStep('question');
        onCancel();
    };
    const finish = (businessApp: boolean) => {
        setStep('question');
        onConnect(businessApp);
    };
    const next = () => (answer === 'yes' ? setStep('explain') : finish(false));

    const question = (
        <>
            <div>
                <DialogTitle className="text-lg max-md:text-[22px] font-bold tracking-[-0.015em] text-brand-text">
                    ¿Usas este número en la app de WhatsApp Business?
                </DialogTitle>
                <p className="mt-1.5 text-sm leading-[1.55] text-brand-gray-600">
                    {isPhone ? 'En el celular, hoy. El camino cambia según tu respuesta.' : 'En el celular, hoy. Lo preguntamos antes de abrir Facebook porque el camino cambia.'}
                </p>
            </div>
            <div role="radiogroup" className="grid gap-2.5">
                <Option checked={answer === 'yes'} onSelect={() => setAnswer('yes')}
                    title={isPhone ? 'Sí, está en la app' : 'Sí, está en la app de WhatsApp Business'}
                    hint="Lo sigo usando en el celular y quiero atender también desde Wasmish." />
                <Option checked={answer === 'no'} onSelect={() => setAnswer('no')}
                    title="No" hint="Es un número nuevo, o no lo uso en ninguna app de WhatsApp." />
            </div>
            <div className="flex gap-2.5 rounded-[10px] bg-brand-bg px-3.5 py-3 text-[13px] leading-[1.55] text-brand-gray-600">
                <CircleHelp size={15} className="mt-0.5 flex-none text-brand-muted" />
                <p>
                    <Strong>¿No sabes cuál usas?</Strong>{' '}
                    {isPhone
                        ? 'La app de WhatsApp Business tiene su propio ícono y tu número sale como cuenta de empresa. Si usas el WhatsApp normal, responde «No».'
                        : 'La app de WhatsApp Business tiene su propio ícono, distinto al del WhatsApp normal, y en tu perfil el número sale como cuenta de empresa. Si con ese número usas el WhatsApp normal, responde «No».'}
                </p>
            </div>
        </>
    );

    const explain = (
        <>
            <div>
                <DialogTitle className="text-lg max-md:text-[22px] font-bold tracking-[-0.015em] text-brand-text">
                    Sigues con la app, y además con Wasmish
                </DialogTitle>
                {!isPhone && <p className="mt-1.5 text-sm leading-[1.55] text-brand-gray-600">Antes de seguir, esto es lo que pasa con tu número.</p>}
            </div>
            <Group label="Sigue igual" labelClass="text-brand-accent-strong" dotClass="bg-brand-success" items={[
                <><Strong>Sigues respondiendo desde la app,</Strong> con el mismo número. Tu equipo atiende además desde Wasmish. Desde ahora, lo que escriben tus clientes llega a los dos lados, y lo que respondas desde la app (textos, fotos, videos y documentos) se ve también en Wasmish. Los grupos no pasan a Wasmish.</>,
            ]} />
            <Group label="Cambia" labelClass="text-brand-warning" dotClass="bg-brand-warning" items={[
                <><Strong>Tus chats de los últimos 6 meses pasan a Wasmish,</Strong> si lo aceptas en la app al escanear el código. Las fotos, audios, videos y documentos que te mandaron tus clientes en las últimas dos semanas se ven aquí; los más viejos y los que mandaste tú se quedan en el celular, y en Wasmish se ve que había uno.</>,
                <><Strong>Tus contactos del celular ponen nombre a tus clientes.</Strong> En Contactos solo aparecen los que tienen chat; el resto de tu agenda no se ve. Si cambias un nombre en el celular, cambia también aquí.</>,
                <><Strong>En la app se apagan las listas de difusión,</Strong> los mensajes temporales, «ver una vez» y la ubicación en tiempo real. Las listas que tienes quedan solo para leer; las campañas las envías desde Wasmish.</>,
                <><Strong>WhatsApp para Windows y para relojes (WearOS) dejan de funcionar con este número.</Strong> WhatsApp Web y los demás dispositivos sí: al conectar se desvinculan todos y los vuelves a vincular.</>,
                <><Strong>Desde Wasmish, las reglas de WhatsApp siguen igual:</Strong> pasadas 24 horas desde el último mensaje del cliente, para escribirle hace falta una plantilla, aunque desde la app se le haya respondido.</>,
            ]} />
            <Group label="Te hace falta" labelClass="text-brand-text" dotClass="bg-brand-text" items={[
                <><Strong>La app actualizada y el celular a mano.</Strong> En la ventana de Facebook vas a escanear un código desde la app.</>,
                <><Strong>Aceptar compartir tus chats, si los quieres aquí.</Strong> Es una sola vez: si no lo aceptas, para traerlos después tendrías que desconectar el número y volver a conectarlo.</>,
                <><Strong>Abrir la app de vez en cuando.</Strong> Si el celular pasa unas dos semanas sin usarla, Meta desconecta el número de Wasmish. Se vuelve a conectar desde aquí.</>,
            ]} />
        </>
    );

    const isQuestion = step === 'question';
    const footer = isQuestion ? (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {!isPhone && <div className="h-10"><CustomButton variant="outline" onClick={close}>Cancelar</CustomButton></div>}
            <div className="h-10 max-md:h-12"><CustomButton onClick={next} disabled={!answer}>Continuar</CustomButton></div>
        </div>
    ) : (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 sm:border-t sm:border-brand-border sm:pt-4">
            <div className="h-10"><CustomButton variant="outline" onClick={() => setStep('question')}>
                {!isPhone && <ChevronLeft size={16} />}Volver
            </CustomButton></div>
            <div className="h-10 max-md:h-12"><CustomButton onClick={() => finish(true)}>Seguir con Facebook<ArrowRight size={16} /></CustomButton></div>
        </div>
    );

    return (
        <Dialog open={open} onClose={close} className="relative z-[60]">
            <DialogBackdrop className="fixed inset-0 bg-brand-ink/50 max-md:hidden" />
            {isPhone ? (
                // En el celular, a pantalla completa: la barra con «‹», el texto que
                // se lee bajando y el botón fijo abajo (m1–m2).
                <DialogPanel className="fixed inset-0 flex flex-col bg-brand-surface">
                    <div className="flex-none flex items-center gap-2 bg-brand-deep text-white px-3 pt-[calc(12px+var(--safe-top))] pb-3">
                        <button type="button" onClick={isQuestion ? close : () => setStep('question')} aria-label="Volver"
                            className="flex p-1 cursor-pointer"><ChevronLeft size={22} strokeWidth={2.2} /></button>
                        <span className="text-[17px] font-semibold">Conectar WhatsApp</span>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-5 grid content-start gap-5">{isQuestion ? question : explain}</div>
                    <div className="flex-none border-t border-brand-border bg-brand-surface px-4 pt-3 pb-[calc(12px+var(--safe-bottom))]">{footer}</div>
                </DialogPanel>
            ) : (
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <DialogPanel className={`w-full ${isQuestion ? 'max-w-[460px]' : 'max-w-[520px]'} max-h-[calc(100dvh-32px)] overflow-y-auto
                        bg-brand-surface border border-brand-border rounded-2xl shadow-[0_18px_40px_rgba(14,17,22,0.12)] p-6
                        grid grid-cols-[minmax(0,1fr)] gap-4`}>
                        {isQuestion ? question : explain}
                        {footer}
                    </DialogPanel>
                </div>
            )}
        </Dialog>
    );
};
