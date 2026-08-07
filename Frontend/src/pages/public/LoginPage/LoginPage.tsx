import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, MessageSquare, Zap, BarChart2 } from 'lucide-react';
import { CustomButton } from '../../../components/Button/Button';
import { CustomInput } from '../../../components/Input/Input';
import { useAuthContext } from '../../../context/auth.context';
import { Link, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../../../models/routes.models';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import { Logo } from '../../../components/Logo/Logo';


// ─── Sub-components ───────────────────────────────────────────────────────────

const FeatureChip = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-1.5 bg-brand-raised/50 border border-brand-border/40
    rounded-full px-3 py-1 backdrop-blur-sm">
    <span className="text-brand-accent-strong">{icon}</span>
    <span className="text-brand-muted text-xs">{label}</span>
  </div>
);

// Signature element: tarjeta de conversación pendiente
const ConversationPreview = () => (
  <div className="bg-brand-raised/70 backdrop-blur-md border border-brand-border/50
    rounded-xl p-4 max-w-[230px]">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-brand-accent/15 border border-brand-accent/25
          flex items-center justify-center flex-shrink-0">
          <span className="text-brand-accent-strong text-xs font-semibold">MC</span>
        </div>
        <div>
          <p className="text-brand-text text-xs font-medium leading-tight">María C.</p>
          <p className="text-brand-subtle text-[10px]">hace 2 min</p>
        </div>
      </div>
      <div className="w-5 h-5 bg-brand-accent rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-black text-[10px] font-bold leading-none">3</span>
      </div>
    </div>
    <p className="text-brand-muted text-xs leading-relaxed line-clamp-2">
      "Hola, quisiera saber el estado de mi pedido #1234..."
    </p>
    <div className="mt-3 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse flex-shrink-0" />
      <span className="text-brand-subtle text-[10px]">3 conversaciones sin leer</span>
    </div>
  </div>
);

// Campo contraseña con toggle de visibilidad
const PasswordInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) => {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-1 pb-1.5 text-xs font-medium text-brand-muted tracking-wide uppercase">
        Contraseña <span className="text-brand-danger">*</span>
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder="••••••••"
          value={value}
          onChange={onChange}
          required
          className="bg-brand-raised border border-brand-border text-brand-text placeholder:text-brand-subtle
            rounded-md p-2.5 w-full pr-10 text-sm
            focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30
            transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-subtle
            hover:text-brand-muted transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, errors, isAuthenticated, isLoading } = useAuthContext();
  const { setState, setContent } = useModalContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(`${AppRoutes.private.root}/${AppRoutes.private.quickStart}`);
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    signIn(email, password);
  };

  useEffect(() => {
    if (errors.length > 0) {
      setContent(
        <div className="text-brand-danger text-sm space-y-0.5">
          {errors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      );
      setState(true);
    }
  }, [errors, setContent, setState]);

  return (
    <div className="w-screen min-h-screen bg-brand-bg flex justify-center items-center p-4 py-8">
      <div className="flex flex-col lg:flex-row w-full max-w-md lg:max-w-4xl lg:min-h-[540px]
        rounded-2xl overflow-hidden border border-brand-border shadow-2xl ring-1 ring-white/[0.04]">

        {/* ── Panel izquierdo — hero ── */}
        <div className="lg:basis-3/5 relative overflow-hidden hidden lg:flex flex-col">
          {/* Base clara con un toque de verde menta */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-surface via-brand-bg to-[#dff2e7]" />

          {/* Dot-grid pattern */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, #c3ccd8 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Glow radial verde — focaliza el centro del panel */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 75% 55% at 50% 42%, rgba(37,211,102,0.14) 0%, transparent 70%)',
            }}
          />

          {/* Logotipo flotante — top-left */}
          <div className="absolute top-8 left-8 flex items-center gap-2.5 z-10">
            <Logo className="w-7 h-7" />
            <span className="text-brand-text font-semibold text-sm tracking-wide">Wasmish</span>
          </div>

          {/* Contenido anclado abajo */}
          <div className="relative z-10 mt-auto p-8 pb-10">
            <h2 className="text-brand-text font-bold text-2xl leading-snug mb-4 max-w-[240px]">
              Tu WhatsApp Business,<br />bajo control.
            </h2>

            {/* Feature chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <FeatureChip icon={<MessageSquare size={11} />} label="Chats centralizados" />
              <FeatureChip icon={<Zap size={11} />}           label="Respuestas rápidas" />
              <FeatureChip icon={<BarChart2 size={11} />}     label="Métricas en vivo" />
            </div>

            {/* Signature: conversación pendiente */}
            <ConversationPreview />
          </div>
        </div>

        {/* ── Panel derecho — formulario ── */}
        <div className="bg-brand-surface lg:border-l border-brand-border
          w-full lg:basis-2/5 px-6 py-8 lg:px-10 lg:py-10 flex flex-col justify-center">

          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-6 lg:hidden">
            <Logo className="w-10 h-10" />
            <span className="text-brand-text font-bold text-lg">Wasmish</span>
          </div>

          {/* Encabezado */}
          <div className="mb-7">
            <h1 className="font-bold text-xl text-brand-text leading-tight">
              Bienvenido de nuevo
            </h1>
            <p className="text-brand-muted text-sm mt-1">
              Tus conversaciones te esperan.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <CustomInput
              label="Correo electrónico"
              required
              type="email"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {/* Recordar + Olvidé contraseña */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border border-brand-border bg-brand-raised
                    accent-brand-accent cursor-pointer"
                />
                <span className="text-brand-subtle text-xs">Recordar dispositivo</span>
              </label>
              <span className="text-xs text-brand-accent-strong cursor-pointer hover:underline">
                ¿Olvidaste tu contraseña?
              </span>
            </div>

            {/* CTA */}
            <div className="h-10 mt-1">
              <CustomButton type="submit" isLoading={isLoading}>
                {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
              </CustomButton>
            </div>

            {/* Separador */}
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-brand-border" />
              <span className="text-brand-subtle text-xs">o</span>
              <hr className="flex-1 border-brand-border" />
            </div>

            <p className="text-brand-subtle text-sm text-center">
              ¿No tienes cuenta?{' '}
              <Link to={AppRoutes.register} className="text-brand-accent-strong font-medium hover:underline">
                Regístrate ahora
              </Link>
            </p>
          </form>
        </div>

      </div>
    </div>
  );
};
