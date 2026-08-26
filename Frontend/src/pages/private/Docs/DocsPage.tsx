import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, KeyRound, Send, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { AppRoutes } from '../../../models/routes.models';
import { CodeBlock } from './CodeBlock';
import { Code, Callout, StepHeading, RefTable } from './DocsUI';

// Base real del API según el entorno donde corre la app.
const API_BASE = `${window.location.origin}/api`;
const ENDPOINT = `${API_BASE}/v1/templates/send`;

// ─── Índice lateral ─────────────────────────────────────────────────────────
const SECTIONS = [
    { id: 'introduccion',  label: 'Introducción' },
    { id: 'autenticacion', label: 'Autenticación' },
    { id: 'endpoint',      label: 'Endpoint' },
    { id: 'parametros',    label: 'Parámetros del body' },
    { id: 'variables',     label: 'Variables' },
    { id: 'botones',       label: 'Botones con parámetros' },
    { id: 'ejemplos',      label: 'Ejemplos de petición' },
    { id: 'respuesta',     label: 'Respuesta' },
    { id: 'errores',       label: 'Errores' },
];

const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Marca en el índice la sección que se está leyendo. */
const useActiveSection = () => {
    const [active, setActive] = useState(SECTIONS[0].id);

    useEffect(() => {
        // El margen inferior hace que una sección se active cuando su título
        // entra en el tercio superior de la pantalla, no al asomar por abajo.
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.id);
            },
            { rootMargin: '0px 0px -70% 0px', threshold: 0 }
        );

        SECTIONS.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    return active;
};

// ─── Sub-componentes de contenido ───────────────────────────────────────────
const MethodBadge = ({ method }: { method: string }) => (
    <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-[0.05em]
        bg-brand-accent-soft text-brand-accent-strong rounded px-2 py-1">
        {method}
    </span>
);

const Param = ({ name, type, required, children }: {
    name: string; type: string; required?: boolean; children: React.ReactNode;
}) => (
    <tr className="border-b border-brand-border last:border-0 align-top">
        <td className="py-3 px-4 whitespace-nowrap">
            <code className="font-mono text-[13px] font-medium text-brand-text">{name}</code>
            {required && <span className="text-brand-danger ml-1" title="Requerido">*</span>}
        </td>
        <td className="py-3 pr-4 whitespace-nowrap">
            <span className="font-mono text-[12px] text-brand-subtle">{type}</span>
        </td>
        <td className="py-3 pr-4 text-sm leading-[1.6] text-brand-muted">{children}</td>
    </tr>
);

const ErrorRow = ({ code, children }: { code: string; children: React.ReactNode }) => (
    <tr className="border-b border-brand-border last:border-0 align-top">
        <td className="py-3 px-4 whitespace-nowrap">
            <code className="font-mono text-[13px] font-bold text-brand-danger">{code}</code>
        </td>
        <td className="py-3 pr-4 text-sm leading-[1.6] text-brand-muted">{children}</td>
    </tr>
);

export const DocsPage = () => {
    const navigate = useNavigate();
    const active = useActiveSection();

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

    const buttonsExample = `"buttons": [
  { "index": 0, "parameters": ["123456"] }
]`;

    const otpCurl = `curl -X POST ${ENDPOINT} \\
  -H "Authorization: Bearer wm_tu_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "destinationNumber": "593987654321",
    "templateName": "otp_login",
    "parameters": ["123456"],
    "buttons": [
      { "index": 0, "parameters": ["123456"] }
    ]
  }'`;

    const okResponse = `{
  "success": true,
  "waMessageId": "wamid.HBgLNTkzOTg3...",
  "conversationId": "6634f1a2b3c4d5e6f7a8b9c0"
}`;

    return (
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10">

            {/* Encabezado */}
            <header className="flex items-start gap-3.5 mb-10">
                <div className="w-10 h-10 rounded-[10px] bg-brand-accent-soft text-brand-accent-strong
                    flex items-center justify-center flex-none">
                    <BookOpen size={20} />
                </div>
                <div>
                    <h1 className="text-[30px] font-bold tracking-[-0.03em] leading-none text-brand-text">
                        Documentación
                    </h1>
                    <p className="text-[15px] text-brand-muted mt-2">
                        Guías e integraciones para sacarle el máximo a Wasmish.
                    </p>
                </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-10">

                {/* ── Índice lateral ── */}
                <aside className="lg:w-56 flex-none">
                    <nav className="lg:sticky lg:top-6 flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em]
                            text-brand-muted px-3 mb-2">
                            Contenido
                        </span>
                        {SECTIONS.map((s) => {
                            const isActive = active === s.id;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => scrollTo(s.id)}
                                    className={`relative text-left text-sm rounded-md px-3 py-2
                                        border-l-[3px] transition-colors cursor-pointer
                                        ${isActive
                                            ? 'border-l-brand-accent bg-brand-bg text-brand-accent-strong font-semibold'
                                            : 'border-l-transparent text-brand-muted hover:bg-brand-bg hover:text-brand-text'}`}
                                >
                                    {s.label}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* ── Contenido ── */}
                <div className="flex-1 min-w-0">

                    {/* Introducción */}
                    <section>
                        <h2 id="introduccion" className="scroll-mt-6 text-[22px] font-bold
                            tracking-[-0.02em] text-brand-text mb-3">
                            Introducción
                        </h2>
                        <p className="text-[15px] leading-[1.6] text-brand-strong max-w-[680px]">
                            Wasmish expone una <span className="font-semibold text-brand-text">API pública</span> para
                            que envíes plantillas de WhatsApp desde tus propios sistemas (tu backend, un CRM, un
                            e-commerce, etc.). Cada envío se autentica con una{' '}
                            <span className="font-semibold text-brand-text">API key</span> y queda registrado en tus
                            conversaciones, apareciendo en vivo dentro de Wasmish.
                        </p>
                    </section>

                    {/* API · Envío de plantillas */}
                    <section className="mt-12">
                        <div className="flex items-center gap-2.5 mb-5">
                            <Send size={20} className="text-brand-accent-strong" />
                            <h2 className="text-[22px] font-bold tracking-[-0.02em] text-brand-text">
                                API · Envío de plantillas
                            </h2>
                        </div>

                        <Callout icon={<Info size={16} />} title="Antes de empezar">
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Tener tu <span className="text-brand-text font-medium">WhatsApp Business conectado</span> en Wasmish.</li>
                                <li>Que la plantilla exista y esté <span className="text-brand-text font-medium">aprobada por Meta</span> (sincronízala desde Plantillas).</li>
                                <li>Haber generado una <span className="text-brand-text font-medium">API key</span> en Ajustes.</li>
                            </ul>
                        </Callout>

                        {/* Autenticación */}
                        <StepHeading n={1} id="autenticacion">Autenticación</StepHeading>
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 max-w-[680px]">
                            Todas las peticiones requieren tu API key en la cabecera <Code>Authorization</Code> con
                            el prefijo <Code>Bearer</Code>. La key se muestra{' '}
                            <span className="font-semibold text-brand-text">una sola vez</span> al generarla —
                            guárdala en un lugar seguro.
                        </p>
                        <CodeBlock lang="http" code={`Authorization: Bearer wm_tu_api_key`} />
                        <button
                            type="button"
                            onClick={() => navigate(`${AppRoutes.private.root}/${AppRoutes.private.settings}`)}
                            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold
                                text-brand-accent-strong hover:underline cursor-pointer"
                        >
                            <KeyRound size={14} /> Generar una API key en Ajustes
                            <ArrowRight size={13} />
                        </button>

                        {/* Endpoint */}
                        <StepHeading n={2} id="endpoint">Endpoint</StepHeading>
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-border
                            bg-brand-bg px-4 py-3.5">
                            <MethodBadge method="POST" />
                            <code className="font-mono text-[13px] text-brand-text break-all">{ENDPOINT}</code>
                        </div>

                        {/* Parámetros */}
                        <StepHeading n={3} id="parametros">Parámetros del body</StepHeading>
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 max-w-[680px]">
                            Formato <Code>application/json</Code>. Los campos con{' '}
                            <span className="text-brand-danger font-semibold">*</span> son obligatorios. Los
                            opcionales puedes omitirlos o enviarlos como <Code>null</Code>.
                        </p>
                        <RefTable head={['Campo', 'Tipo', 'Descripción']}>
                            <Param name="destinationNumber" type="string" required>
                                Número destino con código de país, sin símbolos. Ej: <Code>593987654321</Code>.
                            </Param>
                            <Param name="templateName" type="string" required>
                                Nombre exacto de la plantilla aprobada en Meta.
                            </Param>
                            <Param name="language" type="string">
                                Código de idioma. Si lo omites se usa el idioma con el que la plantilla está
                                registrada en Meta. Ej: <Code>es</Code>, <Code>en_US</Code>.
                            </Param>
                            <Param name="parameters" type="array">
                                Valores para las variables de la plantilla. Posicionales{' '}
                                <Code>{`["Juan","1234"]`}</Code> o nombrados <Code>{`[{name,value}]`}</Code> (ver abajo).
                            </Param>
                            <Param name="buttons" type="array">
                                Parámetros para los botones de la plantilla. Necesario si la plantilla tiene
                                botones dinámicos (ver{' '}
                                <button type="button" onClick={() => scrollTo('botones')}
                                    className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">
                                    Botones con parámetros
                                </button>).
                            </Param>
                            <Param name="contactName" type="string">
                                Nombre para mostrar del contacto en la conversación de Wasmish.
                            </Param>
                        </RefTable>

                        {/* Tipos de parámetros */}
                        <StepHeading n={4} id="variables">Variables: posicionales vs nombradas</StepHeading>
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 max-w-[680px]">
                            Si tu plantilla usa variables numeradas <Code>{`{{1}} {{2}}`}</Code>, envía un arreglo{' '}
                            <span className="font-semibold text-brand-text">posicional</span> en orden:
                        </p>
                        <CodeBlock lang="json" code={`"parameters": ["Juan", "1234"]`} />
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 mt-5 max-w-[680px]">
                            Si tu plantilla usa variables{' '}
                            <span className="font-semibold text-brand-text">nombradas</span>{' '}
                            <Code>{`{{first_name}}`}</Code>, envía objetos <Code>{`{ name, value }`}</Code>:
                        </p>
                        <CodeBlock lang="json" code={namedParams} />

                        {/* Botones */}
                        <StepHeading n={5} id="botones">Botones con parámetros</StepHeading>
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 max-w-[680px]">
                            Si tu plantilla tiene botones{' '}
                            <span className="font-semibold text-brand-text">dinámicos</span> — una URL con
                            variable, una respuesta rápida con payload, un código de copia, o una plantilla de
                            autenticación con{' '}
                            <span className="font-semibold text-brand-text">one-tap / zero-tap</span> — Meta exige
                            que envíes sus valores además de los del cuerpo. Para eso está <Code>buttons</Code>.
                        </p>
                        <CodeBlock lang="json" code={buttonsExample} />

                        <div className="mt-5">
                            <RefTable head={['Campo', 'Tipo', 'Descripción']}>
                                <Param name="subType" type="string">
                                    Normalmente <span className="font-semibold text-brand-text">no hace falta</span>:
                                    Wasmish lee la definición de tu plantilla y aplica el formato correcto. Envíalo
                                    solo como respaldo, si todavía no has sincronizado la plantilla:{' '}
                                    <Code>url</Code>, <Code>quick_reply</Code> o <Code>copy_code</Code>.
                                </Param>
                                <Param name="index" type="number">
                                    Posición del botón en la plantilla, empezando en <Code>0</Code>. Si lo omites
                                    se asume el orden del arreglo.
                                </Param>
                                <Param name="parameters" type="array" required>
                                    Valores del botón, como texto plano. Wasmish les da el formato que Meta espera
                                    según el tipo de botón que tenga tu plantilla.
                                </Param>
                            </RefTable>
                        </div>

                        <div className="mt-5">
                            <Callout tone="info" icon={<Info size={16} />}
                                title="No tienes que adivinar el tipo de botón">
                                Un mismo botón «Copiar código» se envía distinto según la plantilla: en una de
                                autenticación viaja como texto y en una de cupón como <Code>coupon_code</Code>.
                                En el teléfono se ven idénticos. Wasmish lo resuelve leyendo tu plantilla
                                aprobada, así que basta con <Code>index</Code> y <Code>parameters</Code>.
                            </Callout>
                        </div>

                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4 mt-6 max-w-[680px]">
                            Ejemplo típico: una plantilla de{' '}
                            <span className="font-semibold text-brand-text">código de verificación</span>. El
                            código va dos veces — una en el cuerpo del mensaje y otra en el botón:
                        </p>
                        <CodeBlock lang="bash" code={otpCurl} />

                        <div className="mt-5">
                            <Callout tone="warning" icon={<AlertTriangle size={16} />}>
                                Si la plantilla tiene un botón dinámico y no envías <Code>buttons</Code>, Meta
                                rechaza el mensaje con el error{' '}
                                <Code>131008 — Button at index 0 of type Url requires a parameter</Code>.
                            </Callout>
                        </div>

                        {/* Ejemplo cURL */}
                        <StepHeading n={6} id="ejemplos">Ejemplos de petición</StepHeading>
                        <p className="text-sm font-medium text-brand-muted mb-2.5">cURL</p>
                        <CodeBlock lang="bash" code={curl} />
                        <p className="text-sm font-medium text-brand-muted mb-2.5 mt-5">JavaScript (fetch)</p>
                        <CodeBlock lang="javascript" code={jsFetch} />

                        {/* Respuesta */}
                        <StepHeading n={7} id="respuesta">Respuesta exitosa</StepHeading>
                        <p className="text-[15px] leading-[1.6] text-brand-strong mb-4">
                            <code className="font-mono text-[13px] font-semibold text-brand-success">200 OK</code>
                            {' '}— el mensaje se envió a WhatsApp:
                        </p>
                        <CodeBlock lang="json" code={okResponse} />

                        {/* Errores */}
                        <h3 id="errores" className="scroll-mt-6 flex items-center gap-2 text-[17px]
                            font-semibold text-brand-text mt-9 mb-2.5">
                            <AlertTriangle size={16} className="text-brand-danger" /> Errores
                        </h3>
                        <RefTable head={['Código', 'Significado']}>
                            <ErrorRow code="400">Body inválido — la respuesta indica qué campo falló. También aparece cuando un botón no cuadra con la plantilla: el índice no existe, el botón tiene una URL fija y no admite parámetros, o va sin <Code>parameters</Code>. Wasmish lo detecta antes de llamar a Meta.</ErrorRow>
                            <ErrorRow code="401">API key faltante o inválida. Revisa la cabecera <Code>Authorization</Code>.</ErrorRow>
                            <ErrorRow code="403">API key inactiva (revocada). Genera una nueva.</ErrorRow>
                            <ErrorRow code="404">La plantilla no existe en tu cuenta de WhatsApp o todavía no está aprobada. También puede ser que el usuario asociado a la key no exista.</ErrorRow>
                            <ErrorRow code="409">Tu cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar.</ErrorRow>
                            <ErrorRow code="502">WhatsApp/Meta rechazó el envío. La respuesta incluye <Code>errorCode</Code> y <Code>errorDetail</Code> (número inválido, plantilla en pausa, parámetros que no cuadran, etc.).</ErrorRow>
                            <ErrorRow code="500">Error interno del servidor.</ErrorRow>
                        </RefTable>

                        {/* Nota final */}
                        <div className="mt-8">
                            <Callout icon={<Info size={16} />}>
                                Cada envío se guarda como mensaje saliente en la conversación del número destino y
                                se emite en tiempo real a tu sesión de Wasmish. Si el envío falla, igual queda
                                registrado con estado <Code>failed</Code> y el detalle del error.
                            </Callout>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
