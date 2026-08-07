import { useNavigate } from 'react-router-dom';
import { BookOpen, KeyRound, Send, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { AppRoutes } from '../../../models/routes.models';
import { CodeBlock } from './CodeBlock';

// Base real del API según el entorno donde corre la app.
const API_BASE = `${window.location.origin}/api`;
const ENDPOINT = `${API_BASE}/v1/templates/send`;

// ─── Índice lateral ─────────────────────────────────────────────────────────
const SECTIONS = [
    { id: 'introduccion', label: 'Introducción' },
    { id: 'enviar-plantillas', label: 'API · Envío de plantillas' },
];

const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ─── Sub-componentes de contenido ───────────────────────────────────────────
const MethodBadge = ({ method }: { method: string }) => (
    <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wide
        bg-brand-accent/15 text-brand-accent-strong rounded px-2 py-0.5">
        {method}
    </span>
);

const Param = ({ name, type, required, children }: {
    name: string; type: string; required?: boolean; children: React.ReactNode;
}) => (
    <tr className="border-b border-brand-border last:border-0 align-top">
        <td className="py-2.5 px-4 whitespace-nowrap">
            <code className="font-mono text-[13px] text-brand-text">{name}</code>
            {required && <span className="text-brand-danger ml-1" title="Requerido">*</span>}
        </td>
        <td className="py-2.5 pr-4 whitespace-nowrap">
            <span className="text-xs text-brand-subtle font-mono">{type}</span>
        </td>
        <td className="py-2.5 pr-4 text-sm text-brand-muted leading-relaxed">{children}</td>
    </tr>
);

const ErrorRow = ({ code, children }: { code: string; children: React.ReactNode }) => (
    <tr className="border-b border-brand-border last:border-0 align-top">
        <td className="py-2.5 px-4 whitespace-nowrap">
            <code className="font-mono text-[13px] font-semibold text-brand-danger">{code}</code>
        </td>
        <td className="py-2.5 pr-4 text-sm text-brand-muted leading-relaxed">{children}</td>
    </tr>
);

export const DocsPage = () => {
    const navigate = useNavigate();

    const curl = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer wm_tu_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destinationNumber": "593987654321",
    "templateName": "bienvenida",
    "language": "es",
    "parameters": ["Juan", "Pedido #1234"],
    "contactName": "Juan Pérez"
  }'`;

    const jsFetch = `const res = await fetch("${ENDPOINT}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer wm_tu_api_key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    destinationNumber: "593987654321",
    templateName: "bienvenida",
    language: "es",
    parameters: ["Juan", "Pedido #1234"],
  }),
});

const data = await res.json();
console.log(data); // { success: true, waMessageId, conversationId }`;

    const namedParams = `"parameters": [
  { "name": "first_name", "value": "Juan" },
  { "name": "order_id",   "value": "1234" }
]`;

    const okResponse = `{
  "success": true,
  "waMessageId": "wamid.HBgLNTkzOTg3...",
  "conversationId": "6634f1a2b3c4d5e6f7a8b9c0"
}`;

    return (
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10">

            {/* Encabezado */}
            <div className="flex items-start gap-3 mb-8">
                <div className="w-10 h-10 rounded-lg bg-brand-accent/10 text-brand-accent-strong
                    flex items-center justify-center flex-shrink-0">
                    <BookOpen size={20} />
                </div>
                <div>
                    <h1 className="font-bold text-brand-text text-2xl leading-tight">Documentación</h1>
                    <p className="text-brand-muted text-sm mt-1">
                        Guías e integraciones para sacarle el máximo a Wasmish.
                    </p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">

                {/* ── Índice lateral ── */}
                <aside className="lg:w-56 flex-shrink-0">
                    <nav className="lg:sticky lg:top-4 flex flex-col gap-0.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-brand-subtle px-3 mb-1">
                            Contenido
                        </span>
                        {SECTIONS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => scrollTo(s.id)}
                                className="text-left text-sm text-brand-muted hover:text-brand-text
                                    hover:bg-brand-raised rounded-md px-3 py-2 transition-colors cursor-pointer"
                            >
                                {s.label}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* ── Contenido ── */}
                <div className="flex-1 min-w-0 space-y-12">

                    {/* Introducción */}
                    <section id="introduccion" className="scroll-mt-4">
                        <h2 className="font-bold text-brand-text text-lg mb-3">Introducción</h2>
                        <p className="text-brand-muted text-sm leading-relaxed">
                            Wasmish expone una <span className="text-brand-text font-medium">API pública</span> para
                            que envíes plantillas de WhatsApp desde tus propios sistemas (tu backend, un CRM, un
                            e-commerce, etc.). Cada envío se autentica con una <span className="text-brand-text font-medium">API key</span> y
                            queda registrado en tus conversaciones, apareciendo en vivo dentro de Wasmish.
                        </p>
                    </section>

                    {/* API · Envío de plantillas */}
                    <section id="enviar-plantillas" className="scroll-mt-4">
                        <div className="flex items-center gap-2 mb-4">
                            <Send size={18} className="text-brand-accent-strong" />
                            <h2 className="font-bold text-brand-text text-lg">API · Envío de plantillas</h2>
                        </div>

                        {/* Requisitos */}
                        <div className="rounded-xl border border-brand-border bg-brand-raised/50 p-4 mb-6">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Info size={14} className="text-brand-accent-strong" />
                                <h3 className="font-semibold text-brand-text text-sm">Antes de empezar</h3>
                            </div>
                            <ul className="text-sm text-brand-muted leading-relaxed list-disc pl-5 space-y-1">
                                <li>Tener tu <span className="text-brand-text">WhatsApp Business conectado</span> en Wasmish.</li>
                                <li>Que la plantilla exista y esté <span className="text-brand-text">aprobada por Meta</span> (sincronízala desde Plantillas).</li>
                                <li>Haber generado una <span className="text-brand-text">API key</span> en Ajustes.</li>
                            </ul>
                        </div>

                        {/* Autenticación */}
                        <h3 className="font-semibold text-brand-text text-base mb-2">1. Autenticación</h3>
                        <p className="text-brand-muted text-sm leading-relaxed mb-3">
                            Todas las peticiones requieren tu API key en la cabecera <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">Authorization</code> con
                            el prefijo <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">Bearer</code>. La key se
                            muestra <span className="text-brand-text font-medium">una sola vez</span> al generarla — guárdala en un lugar seguro.
                        </p>
                        <CodeBlock lang="http" code={`Authorization: Bearer wm_tu_api_key`} />
                        <button
                            type="button"
                            onClick={() => navigate(`${AppRoutes.private.root}/${AppRoutes.private.settings}`)}
                            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-brand-accent-strong hover:underline cursor-pointer"
                        >
                            <KeyRound size={14} /> Generar una API key en Ajustes
                            <ArrowRight size={13} />
                        </button>

                        {/* Endpoint */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8">2. Endpoint</h3>
                        <div className="flex flex-wrap items-center gap-2.5 mb-4 rounded-lg border border-brand-border bg-brand-raised px-4 py-3">
                            <MethodBadge method="POST" />
                            <code className="font-mono text-[13px] text-brand-text break-all">{ENDPOINT}</code>
                        </div>

                        {/* Parámetros */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8">3. Parámetros del body</h3>
                        <p className="text-brand-muted text-sm mb-3">Formato <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">application/json</code>. Los campos con <span className="text-brand-danger">*</span> son obligatorios.</p>
                        <div className="overflow-x-auto rounded-xl border border-brand-border">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-brand-border bg-brand-raised/60 text-left">
                                        <th className="py-2.5 px-4 text-[11px] font-medium uppercase tracking-wide text-brand-subtle">Campo</th>
                                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-brand-subtle">Tipo</th>
                                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-brand-subtle">Descripción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <Param name="destinationNumber" type="string" required>
                                        Número destino con código de país, sin símbolos. Ej: <code className="font-mono text-xs text-brand-text">593987654321</code>.
                                    </Param>
                                    <Param name="templateName" type="string" required>
                                        Nombre exacto de la plantilla aprobada en Meta.
                                    </Param>
                                    <Param name="language" type="string">
                                        Código de idioma de la plantilla. Por defecto <code className="font-mono text-xs text-brand-text">es</code>. Ej: <code className="font-mono text-xs text-brand-text">en_US</code>.
                                    </Param>
                                    <Param name="parameters" type="array">
                                        Valores para las variables de la plantilla. Posicionales <code className="font-mono text-xs text-brand-text">{`["Juan","1234"]`}</code> o nombrados <code className="font-mono text-xs text-brand-text">{`[{name,value}]`}</code> (ver abajo).
                                    </Param>
                                    <Param name="contactName" type="string">
                                        Nombre para mostrar del contacto en la conversación de Wasmish.
                                    </Param>
                                </tbody>
                            </table>
                        </div>

                        {/* Tipos de parámetros */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8">4. Variables: posicionales vs nombradas</h3>
                        <p className="text-brand-muted text-sm leading-relaxed mb-3">
                            Si tu plantilla usa variables numeradas <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">{`{{1}} {{2}}`}</code>, envía
                            un arreglo <span className="text-brand-text font-medium">posicional</span> en orden:
                        </p>
                        <CodeBlock lang="json" code={`"parameters": ["Juan", "1234"]`} />
                        <p className="text-brand-muted text-sm leading-relaxed mb-3 mt-4">
                            Si tu plantilla usa variables <span className="text-brand-text font-medium">nombradas</span> <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">{`{{first_name}}`}</code>, envía objetos <code className="font-mono text-[13px] text-brand-text bg-brand-raised px-1.5 py-0.5 rounded">{`{ name, value }`}</code>:
                        </p>
                        <CodeBlock lang="json" code={namedParams} />

                        {/* Ejemplo cURL */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8">5. Ejemplo de petición</h3>
                        <p className="text-brand-muted text-sm mb-3">cURL:</p>
                        <CodeBlock lang="bash" code={curl} />
                        <p className="text-brand-muted text-sm mb-3 mt-4">JavaScript (fetch):</p>
                        <CodeBlock lang="javascript" code={jsFetch} />

                        {/* Respuesta */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8">6. Respuesta exitosa</h3>
                        <p className="text-brand-muted text-sm mb-3">
                            <code className="font-mono text-[13px] text-brand-accent-strong">200 OK</code> — el mensaje se envió a WhatsApp:
                        </p>
                        <CodeBlock lang="json" code={okResponse} />

                        {/* Errores */}
                        <h3 className="font-semibold text-brand-text text-base mb-2 mt-8 flex items-center gap-1.5">
                            <AlertTriangle size={15} className="text-brand-danger" /> Errores
                        </h3>
                        <div className="overflow-x-auto rounded-xl border border-brand-border">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-brand-border bg-brand-raised/60 text-left">
                                        <th className="py-2.5 px-4 text-[11px] font-medium uppercase tracking-wide text-brand-subtle">Código</th>
                                        <th className="py-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-brand-subtle">Significado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <ErrorRow code="400">Body inválido (falta <code className="font-mono text-xs">destinationNumber</code> o <code className="font-mono text-xs">templateName</code>), o tu WhatsApp no está conectado.</ErrorRow>
                                    <ErrorRow code="401">API key faltante o inválida. Revisa la cabecera <code className="font-mono text-xs">Authorization</code>.</ErrorRow>
                                    <ErrorRow code="403">API key inactiva (revocada). Genera una nueva.</ErrorRow>
                                    <ErrorRow code="404">Usuario asociado a la key no encontrado.</ErrorRow>
                                    <ErrorRow code="502">WhatsApp/Meta rechazó el envío. La respuesta incluye <code className="font-mono text-xs">errorCode</code> y <code className="font-mono text-xs">errorDetail</code> (plantilla no aprobada, idioma incorrecto, número inválido, etc.).</ErrorRow>
                                    <ErrorRow code="500">Error interno del servidor.</ErrorRow>
                                </tbody>
                            </table>
                        </div>

                        {/* Nota final */}
                        <div className="rounded-xl border border-brand-border bg-brand-raised/50 p-4 mt-6 flex gap-3">
                            <Info size={16} className="text-brand-accent-strong flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-brand-muted leading-relaxed">
                                Cada envío se guarda como mensaje saliente en la conversación del número destino y
                                se emite en tiempo real a tu sesión de Wasmish. Si el envío falla, igual queda
                                registrado con estado <code className="font-mono text-xs text-brand-text">failed</code> y el detalle del error.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
