import { ArrowRight } from "lucide-react";

const KINDS = [
    { title: 'Bienvenida', text: 'A quien escribe por primera vez.' },
    { title: 'Fuera de horario', text: 'A quien escribe con el negocio cerrado.' },
    { title: 'Palabras clave', text: '«Si dice precio, responder esto».' },
];

/**
 * La primera vez (la cuenta nunca guardó): una invitación a empezar. Las dos
 * salidas abren el asistente; el ejemplo trae la bienvenida y el horario escritos.
 */
export const AutoRepliesIntro = ({ onStart }: { onStart: (example: boolean) => void }) => (
    <section className="rounded-xl bg-brand-deep text-white px-6 sm:px-[26px] pt-[26px] pb-6 grid gap-[18px] max-w-[860px]">
        <div>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">Contesta solo, también de noche</h2>
            <p className="mt-1.5 max-w-[520px] text-[14.5px] leading-[1.55] text-brand-on-deep">
                Deja escritas las respuestas a lo que más te preguntan y Wasmish las manda por todas tus líneas.
                Cuando alguien del equipo responde, el bot se calla.
            </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-brand-deep-active border border-brand-deep-active rounded-[10px] overflow-hidden">
            {KINDS.map(kind => (
                <div key={kind.title} className="bg-brand-deep p-3.5">
                    <div className="text-sm font-semibold">{kind.title}</div>
                    <div className="mt-1 text-[13px] leading-[1.5] text-brand-on-deep-muted">{kind.text}</div>
                </div>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
            <button type="button" onClick={() => onStart(true)}
                className="h-11 px-[18px] rounded-[9px] bg-brand-accent text-brand-ink text-[14.5px] font-bold flex items-center gap-2
                    hover:bg-brand-accent-hover active:bg-brand-accent-active transition-colors cursor-pointer">
                Empezar con un ejemplo <ArrowRight size={16} strokeWidth={2.2} />
            </button>
            <button type="button" onClick={() => onStart(false)}
                className="h-11 px-3 text-sm font-semibold text-brand-on-deep hover:text-white transition-colors cursor-pointer">
                Empezar desde cero
            </button>
        </div>
        <p className="-mt-2 text-[13px] leading-[1.5] text-brand-on-deep-muted">
            El ejemplo deja escrita una bienvenida y un horario de lunes a viernes. Nada sale hasta el último paso.
        </p>
    </section>
);
