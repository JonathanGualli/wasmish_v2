import { useNavigate } from 'react-router-dom';
import {
    Plug, LayoutTemplate, KeyRound, MessageSquare,
    Zap, ShieldCheck, Radio, ArrowRight,
} from 'lucide-react';
import { AppRoutes } from '../../../models/routes.models';
import { CustomButton } from '../../../components/Button/Button';
import { Logo } from '../../../components/Logo/Logo';

const to = (page: string) => `${AppRoutes.private.root}/${page}`;

// ─── Primeros pasos (tarjetas accionables) ──────────────────────────────────
interface Step {
    n: number;
    icon: React.ReactNode;
    title: string;
    desc: string;
    cta: string;
    path: string;
}

const STEPS: Step[] = [
    {
        n: 1,
        icon: <Plug size={20} />,
        title: 'Conecta tu WhatsApp',
        desc: 'Vincula tu cuenta de WhatsApp Business en segundos con «Iniciar sesión con Facebook».',
        cta: 'Ir a Ajustes',
        path: to(AppRoutes.private.settings),
    },
    {
        n: 2,
        icon: <LayoutTemplate size={20} />,
        title: 'Sincroniza tus plantillas',
        desc: 'Trae tus plantillas aprobadas por Meta y tenlas listas para enviar cuando quieras.',
        cta: 'Ver Plantillas',
        path: to(AppRoutes.private.templates),
    },
    {
        n: 3,
        icon: <KeyRound size={20} />,
        title: 'Genera tu API key',
        desc: 'Crea una clave para enviar mensajes desde tus propios sistemas de forma segura.',
        cta: 'Ir a Ajustes',
        path: to(AppRoutes.private.settings),
    },
    {
        n: 4,
        icon: <MessageSquare size={20} />,
        title: 'Empieza a conversar',
        desc: 'Centraliza todos tus chats y responde a tus clientes desde un solo lugar.',
        cta: 'Abrir Chats',
        path: to(AppRoutes.private.chats),
    },
];

// ─── Capacidades ────────────────────────────────────────────────────────────
const FEATURES = [
    {
        icon: <MessageSquare size={18} />,
        title: 'Chats centralizados',
        desc: 'Todas tus conversaciones de WhatsApp en una sola bandeja ordenada.',
    },
    {
        icon: <Radio size={18} />,
        title: 'Tiempo real',
        desc: 'Mensajes y estados (enviado, entregado, leído) que se actualizan al instante.',
    },
    {
        icon: <Zap size={18} />,
        title: 'API pública',
        desc: 'Envía plantillas desde tus sistemas con una simple llamada autenticada.',
    },
    {
        icon: <ShieldCheck size={18} />,
        title: 'Seguro por diseño',
        desc: 'Tus tokens se cifran con AES-256 y las API keys se guardan como hash irreversible.',
    },
];

/** Caja de icono de tarjeta: tinte verde 100 con el verde de texto encima. */
const IconBox = ({ children, size = 'md' }: { children: React.ReactNode; size?: 'sm' | 'md' }) => (
    <div className={`rounded-[10px] bg-brand-accent-soft text-brand-accent-strong
        flex items-center justify-center flex-none
        ${size === 'sm' ? 'w-9 h-9' : 'w-10 h-10'}`}>
        {children}
    </div>
);

const StepCard = ({ step }: { step: Step }) => {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate(step.path)}
            className="group text-left flex flex-col h-full bg-brand-surface
                border border-brand-border rounded-xl p-5 cursor-pointer transition-colors
                hover:border-brand-border-strong hover:bg-brand-bg"
        >
            <IconBox>{step.icon}</IconBox>

            <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-muted">
                Paso {step.n}
            </div>
            <h3 className="text-[17px] font-semibold text-brand-text mt-1">{step.title}</h3>
            <p className="text-sm leading-[1.6] text-brand-muted mt-1.5 flex-1">{step.desc}</p>

            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent-strong">
                {step.cta}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
        </button>
    );
};

export const QuickStart = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10">

            {/* ── Bienvenida ──
                Sobre gris frío, no sobre verde: el principio 01 del manual reserva
                el verde para la estructura y deja el contenido en claro. El color
                lo ponen el sello y una sola acción en menta. */}
            <section className="rounded-2xl border border-brand-border bg-brand-bg
                px-6 py-8 sm:px-10 sm:py-11 mb-10">
                <Logo className="w-12 h-12" />

                <h1 className="mt-6 font-extrabold text-brand-text tracking-[-0.035em]
                    text-[32px] leading-[1.1] sm:text-[44px] sm:leading-[1.05] text-pretty">
                    Tu WhatsApp Business,<br className="hidden sm:block" /> bajo control.
                </h1>

                <p className="mt-4 text-[15px] leading-[1.6] text-brand-strong max-w-[560px]">
                    <span className="font-semibold text-brand-text">Wasmish</span> centraliza tus
                    conversaciones de WhatsApp Business, envía plantillas y automatiza mensajes
                    con tu propia API — todo desde un solo lugar.
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5 mt-7">
                    <div className="w-full sm:w-[220px] h-10">
                        <CustomButton onClick={() => navigate(to(AppRoutes.private.settings))}>
                            <Plug size={16} /> Conectar WhatsApp
                        </CustomButton>
                    </div>
                    <div className="w-full sm:w-[180px] h-10">
                        <CustomButton variant="outline" onClick={() => navigate(to(AppRoutes.private.chats))}>
                            <MessageSquare size={16} /> Ir a mis chats
                        </CustomButton>
                    </div>
                </div>
            </section>

            {/* ── Primeros pasos ── */}
            <section className="mb-10">
                <div className="flex items-baseline justify-between gap-4 mb-5">
                    <h2 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">
                        Primeros pasos
                    </h2>
                    <span className="text-[13px] text-brand-muted">Configura tu cuenta en 4 pasos</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STEPS.map((step) => (
                        <StepCard key={step.n} step={step} />
                    ))}
                </div>
            </section>

            {/* ── Capacidades ── */}
            <section className="mb-10">
                <h2 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text mb-5">
                    Todo lo que puedes hacer
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {FEATURES.map((f) => (
                        <div
                            key={f.title}
                            className="flex items-start gap-3.5 bg-brand-surface
                                border border-brand-border rounded-xl p-5"
                        >
                            <IconBox size="sm">{f.icon}</IconBox>
                            <div className="min-w-0">
                                <h3 className="text-[15px] font-semibold text-brand-text">{f.title}</h3>
                                <p className="text-sm leading-[1.6] text-brand-muted mt-0.5">{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Soporte ── */}
            <section className="rounded-xl border border-brand-border bg-brand-bg p-5
                flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-[15px] font-semibold text-brand-text">
                        ¿Necesitas ayuda para empezar?
                    </h3>
                    <p className="text-sm text-brand-muted mt-0.5">
                        Escríbenos y te acompañamos en la configuración.
                    </p>
                </div>
                <a
                    href="mailto:soporte@solventyc.com"
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium
                        text-brand-accent-strong hover:underline self-start sm:self-auto"
                >
                    soporte@solventyc.com
                    <ArrowRight size={14} />
                </a>
            </section>
        </div>
    );
};
