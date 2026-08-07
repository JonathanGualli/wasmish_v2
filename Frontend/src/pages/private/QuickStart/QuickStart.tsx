import { useNavigate } from 'react-router-dom';
import {
    Plug, LayoutTemplate, KeyRound, MessageSquare,
    Zap, ShieldCheck, Radio, ArrowRight, Sparkles,
} from 'lucide-react';
import { AppRoutes } from '../../../models/routes.models';
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
        desc: 'Vincula tu cuenta de WhatsApp Business en segundos con “Iniciar sesión con Facebook”.',
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

const StepCard = ({ step }: { step: Step }) => {
    const navigate = useNavigate();
    return (
        <button
            type="button"
            onClick={() => navigate(step.path)}
            className="group text-left flex flex-col h-full bg-brand-surface border border-brand-border
                rounded-xl p-5 transition-all cursor-pointer
                hover:border-brand-accent/50 hover:shadow-md hover:-translate-y-0.5"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 text-brand-accent-strong
                    flex items-center justify-center flex-shrink-0">
                    {step.icon}
                </div>
                <span className="text-xs font-semibold text-brand-subtle tabular-nums
                    bg-brand-raised border border-brand-border rounded-full w-6 h-6 flex items-center justify-center">
                    {step.n}
                </span>
            </div>
            <h3 className="font-semibold text-brand-text text-sm mb-1.5">{step.title}</h3>
            <p className="text-brand-muted text-xs leading-relaxed flex-1">{step.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-accent-strong">
                {step.cta}
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
        </button>
    );
};

export const QuickStart = () => {
    const navigate = useNavigate();

    return (
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10">

            {/* ── Hero ── */}
            <section className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-bg mb-8">
                {/* glow verde sutil */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse 60% 80% at 85% 20%, rgba(37,211,102,0.12) 0%, transparent 70%)' }}
                />
                <div className="relative p-6 sm:p-9">
                    <div className="flex items-center gap-2 mb-5">
                        <span className="inline-flex items-center gap-1.5 bg-brand-accent/10 text-brand-accent-strong
                            text-xs font-medium rounded-full px-3 py-1">
                            <Sparkles size={12} /> Bienvenido
                        </span>
                    </div>

                    <div className="flex items-start gap-4">
                        <Logo className="w-12 h-12 hidden sm:block" />
                        <div className="min-w-0">
                            <h1 className="font-bold text-brand-text text-2xl sm:text-3xl leading-tight mb-3">
                                Tu WhatsApp Business,<br className="hidden sm:block" /> bajo control.
                            </h1>
                            <p className="text-brand-muted text-sm sm:text-base leading-relaxed max-w-2xl">
                                <span className="font-semibold text-brand-text">Wasmish</span> es la herramienta que
                                centraliza y potencia tu WhatsApp Business: gestiona todas tus conversaciones,
                                envía plantillas y automatiza mensajes con tu propia API — todo desde un solo lugar.
                            </p>

                            <div className="flex flex-wrap gap-2.5 mt-6">
                                <button
                                    type="button"
                                    onClick={() => navigate(to(AppRoutes.private.settings))}
                                    className="inline-flex items-center gap-1.5 bg-brand-accent text-black text-sm font-medium
                                        rounded-md px-4 py-2.5 transition-colors hover:bg-brand-accent/85 cursor-pointer"
                                >
                                    <Plug size={16} /> Conectar WhatsApp
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate(to(AppRoutes.private.chats))}
                                    className="inline-flex items-center gap-1.5 bg-brand-raised text-brand-text text-sm font-medium
                                        border border-brand-border rounded-md px-4 py-2.5 transition-colors
                                        hover:bg-brand-surface cursor-pointer"
                                >
                                    <MessageSquare size={16} /> Ir a mis chats
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Primeros pasos ── */}
            <section className="mb-10">
                <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-bold text-brand-text text-lg">Primeros pasos</h2>
                    <span className="text-xs text-brand-subtle">Configura tu cuenta en 4 pasos</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STEPS.map((step) => (
                        <StepCard key={step.n} step={step} />
                    ))}
                </div>
            </section>

            {/* ── Capacidades ── */}
            <section className="mb-10">
                <h2 className="font-bold text-brand-text text-lg mb-4">Todo lo que puedes hacer</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {FEATURES.map((f) => (
                        <div
                            key={f.title}
                            className="flex items-start gap-3.5 bg-brand-surface border border-brand-border rounded-xl p-4"
                        >
                            <div className="w-9 h-9 rounded-lg bg-brand-accent/10 text-brand-accent-strong
                                flex items-center justify-center flex-shrink-0">
                                {f.icon}
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-semibold text-brand-text text-sm mb-0.5">{f.title}</h3>
                                <p className="text-brand-muted text-xs leading-relaxed">{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Soporte ── */}
            <section className="rounded-xl border border-brand-border bg-brand-raised/60 p-5 flex flex-col
                sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-brand-text text-sm">¿Necesitas ayuda para empezar?</h3>
                    <p className="text-brand-muted text-xs mt-0.5">
                        Escríbenos y te acompañamos en la configuración.
                    </p>
                </div>
                <a
                    href="mailto:soporte@solventyc.com"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-accent-strong
                        hover:underline self-start sm:self-auto"
                >
                    soporte@solventyc.com
                    <ArrowRight size={14} />
                </a>
            </section>
        </div>
    );
};
