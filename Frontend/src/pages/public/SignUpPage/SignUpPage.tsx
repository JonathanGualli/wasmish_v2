import React, { useEffect, useState } from 'react';
import { CustomInput } from '../../../components/Input/Input';
import { CustomButton } from '../../../components/Button/Button';
import { AppRoutes } from '../../../models/routes.models';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../../../context/auth.context';
import { useModalContext } from '../../../components/Modal/context/UseModalContext';
import { useSignUp } from '../../../hooks/useSignUp';
import { Logo } from '../../../components/Logo/Logo';
import type { AxiosError } from 'axios';

interface ErrorItem {
  message: string;
}

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
    <div className="w-screen h-screen bg-brand-bg flex justify-center items-center p-4">
      <div className="flex flex-row max-w-5xl w-full rounded-2xl overflow-hidden border border-brand-border shadow-2xl">

        {/* Panel izquierdo — formulario */}
        <div className="bg-brand-surface basis-2/5 p-10 flex flex-col justify-center">
          <div className="flex items-center gap-2.5 mb-8">
            <Logo className="w-10 h-10" />
            <span className="text-brand-text font-bold text-lg">Wasmish</span>
          </div>

          <h1 className="font-bold text-xl text-brand-text mb-1">Crea tu cuenta</h1>
          <p className="text-brand-muted text-sm mb-8">Empieza a centralizar tus chats de WhatsApp</p>

          <form onSubmit={handleSignUp} className="flex flex-col gap-4">
            <CustomInput
              label="Nombre completo"
              required
              type="text"
              placeholder="Jonathan Gualli"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <CustomInput
              label="Correo electrónico"
              required
              type="email"
              placeholder="email@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <CustomInput
              label="Contraseña"
              required
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="h-10 mt-1">
              <CustomButton type="submit" isLoading={isLoading}>
                {isLoading ? 'Cargando...' : 'Crear cuenta'}
              </CustomButton>
            </div>

            <div className="flex items-center gap-3 my-1">
              <hr className="flex-1 border-brand-border" />
              <span className="text-brand-subtle text-xs">o</span>
              <hr className="flex-1 border-brand-border" />
            </div>

            <p className="text-brand-subtle text-sm text-center">
              ¿Ya tienes cuenta?{' '}
              <Link to={AppRoutes.login} className="text-brand-accent-strong font-medium hover:underline">
                Inicia sesión
              </Link>
            </p>
          </form>
        </div>

        {/* Panel derecho — hero */}
        <div className="basis-3/5 relative overflow-hidden hidden md:flex flex-col">
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

          {/* Glow radial verde */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 75% 55% at 50% 42%, rgba(37,211,102,0.14) 0%, transparent 70%)',
            }}
          />

          {/* Contenido anclado abajo */}
          <div className="relative z-10 mt-auto p-10 pb-12">
            <h2 className="text-brand-text font-bold text-2xl leading-snug mb-3 max-w-[280px]">
              Todas tus conversaciones,<br />en un solo lugar.
            </h2>
            <p className="text-brand-muted text-sm max-w-xs leading-relaxed">
              Gestiona todos tus chats de WhatsApp Business desde un panel unificado.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
