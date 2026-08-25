import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { CustomButton } from '../../../components/Button/Button';
import { AuthField, AuthPasswordField } from '../../../components/Auth/AuthField';
import { AuthShell, AuthHero } from '../../../components/Auth/AuthShell';
import { useAuthContext } from '../../../context/auth.context';
import { AppRoutes } from '../../../models/routes.models';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import { useSignUp } from '../../../hooks/useSignUp';
import type { AxiosError } from 'axios';

interface ErrorItem {
  message: string;
}

const PROMISES = [
  '14 días de prueba, sin tarjeta',
  'Conecta tu número cuando quieras',
  'Invita a tu equipo sin coste extra',
];

const legal = (
  <p className="text-xs leading-[1.55] text-brand-subtle">
    {/* No hay página de términos todavía: va como texto, no como enlace roto. */}
    Al crear la cuenta aceptas los <span className="font-semibold text-brand-strong">términos</span> y la{' '}
    <a href="/privacidad.html" className="font-semibold text-brand-accent-strong hover:underline">
      política de privacidad
    </a>.
  </p>
);

export const SignUpPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { isLoading, errors, isAuthenticated, signUp } = useAuthContext();
  const { setState, setContent } = useModalContext();
  const signUpMutation = useSignUp();
  const navigate = useNavigate();

  const handleSignUp = (event: React.FormEvent) => {
    event.preventDefault();
    signUp(name, email, password);
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate(`${AppRoutes.private.root}/${AppRoutes.private.quickStart}`);
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (errors.length > 0) {
      setContent(
        <div className="text-brand-danger text-sm">
          {errors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      );
      setState(true);
    }
  }, [errors, setContent, setState]);

  useEffect(() => {
    if (signUpMutation.isError) {
      setContent(
        <div className="text-brand-danger text-sm">
          {(signUpMutation.error as AxiosError<ErrorItem[]>).response?.data.map((err, i) => (
            <p key={i}>{err.message}</p>
          )) || <p>Ocurrió un error, inténtalo de nuevo más tarde</p>}
        </div>
      );
      setState(true);
    }
  }, [signUpMutation, setContent, setState]);

  return (
    <AuthShell
      hero={
        <AuthHero
          title={<>Empieza en<br />dos minutos.</>}
          footer={
            <>
              ¿Ya tienes cuenta?{' '}
              <Link to={AppRoutes.login} className="font-semibold text-brand-accent hover:underline">
                Entrar
              </Link>
            </>
          }
        >
          <ul className="grid gap-3 mt-[22px]">
            {PROMISES.map((item) => (
              <li key={item} className="flex gap-2.5 items-start text-sm leading-[1.5] text-brand-green-100">
                <Check size={18} strokeWidth={2.4} className="text-brand-accent flex-none mt-[1px]" />
                {item}
              </li>
            ))}
          </ul>
        </AuthHero>
      }
    >
      {/* Cabecera de vuelta — solo en móvil, donde no hay hero con enlace a Entrar */}
      <Link
        to={AppRoutes.login}
        className="flex items-center gap-3.5 mb-6 lg:hidden text-[15px] font-semibold text-brand-gray-600"
      >
        <span className="w-10 h-10 rounded-[10px] border border-brand-border flex items-center justify-center flex-none">
          <ChevronLeft size={19} strokeWidth={2.2} className="text-brand-strong" />
        </span>
        Entrar
      </Link>

      <h1 className="font-bold text-[30px] leading-none tracking-[-0.03em] text-brand-text text-pretty">
        Crear cuenta
      </h1>
      <p className="text-brand-muted text-[15px] mt-2">
        Tres datos y estás dentro.
      </p>

      <form onSubmit={handleSignUp} className="grid gap-[18px] mt-7 lg:mt-7">
        <AuthField
          label="Nombre completo"
          type="text"
          placeholder="Ana Pérez Molina"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
        />

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
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          showStrength
        />

        <CustomButton type="submit" size="lg" isLoading={isLoading}>
          {isLoading ? 'Creando cuenta…' : 'Crear cuenta'}
        </CustomButton>

        {legal}
      </form>
    </AuthShell>
  );
};
