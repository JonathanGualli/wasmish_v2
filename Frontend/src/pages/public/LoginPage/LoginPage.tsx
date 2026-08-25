import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CustomButton } from '../../../components/Button/Button';
import { AuthField, AuthPasswordField } from '../../../components/Auth/AuthField';
import { AuthShell, AuthHero, AuthAvatars } from '../../../components/Auth/AuthShell';
import { LogoLockup } from '../../../components/Logo/Logo';
import { useAuthContext } from '../../../context/auth.context';
import { AppRoutes } from '../../../models/routes.models';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';

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

  const forgotLink = (
    <span className="text-[13px] font-semibold text-brand-accent-strong cursor-pointer hover:underline">
      ¿La olvidaste?
    </span>
  );

  return (
    <AuthShell
      hero={
        <AuthHero
          title={<>Un número.<br />Todo el equipo.</>}
          footer={
            <AuthAvatars
              initials={['AP', 'JG', 'MR']}
              caption="Equipos que ya responden aquí"
            />
          }
        >
          <p className="text-brand-green-200 text-[15px] leading-relaxed mt-3.5 max-w-[260px]">
            Una sola bandeja para responder a tus clientes, con notas internas y plantillas.
          </p>
        </AuthHero>
      }
    >
      {/* Lockup en móvil — el hero de marca no se muestra */}
      <div className="mb-11 lg:hidden">
        <LogoLockup size="lg" />
      </div>

      <h1 className="font-bold text-[30px] leading-none tracking-[-0.03em] text-brand-text">
        Entrar
      </h1>
      <p className="text-brand-muted text-[15px] mt-2">
        Accede a tu bandeja compartida.
      </p>

      <form onSubmit={handleLogin} className="grid gap-[18px] mt-7 lg:mt-[30px]">
        <AuthField
          label="Correo"
          type="email"
          placeholder="tu@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <AuthPasswordField
          label="Contraseña"
          labelAction={<span className="hidden lg:inline">{forgotLink}</span>}
          placeholder="Tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {/* En móvil el enlace de recuperación va en su propia fila */}
        <div className="lg:hidden -mt-1">{forgotLink}</div>

        <label className="hidden lg:flex items-center gap-[9px] text-sm text-brand-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            defaultChecked
            className="w-4 h-4 accent-brand-green-700 cursor-pointer"
          />
          Mantener la sesión abierta
        </label>

        <CustomButton type="submit" size="lg" isLoading={isLoading}>
          {isLoading ? 'Iniciando sesión…' : 'Entrar'}
        </CustomButton>

        <p className="text-brand-muted text-[15px] lg:text-sm text-center lg:text-left">
          ¿No tienes cuenta?{' '}
          <Link
            to={AppRoutes.register}
            className="font-semibold text-brand-accent-strong hover:underline"
          >
            Crear una cuenta
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};
