import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { CustomButton } from '../../../components/Button/Button';
import { AuthField, AuthPasswordField } from '../../../components/Auth/AuthField';
import { AuthShell, AuthHero } from '../../../components/Auth/AuthShell';
import { useAuthContext } from '../../../context/auth.context';
import { AppRoutes } from '../../../models/routes.models';
import { TEAM_ERROR, type AssignableRole, type InvitationInfo } from '../../../models/team.model';
import { acceptInvitationService, getInvitationService } from '../../../services/api.service';
import { apiErrorOf } from '../../../utils/apiError';
import { formatLineDate } from '../../../utils/lineDisplay';

// Qué hará con su rol, en la frase del panel (diseño «Wasmish Equipo», marco 3a).
const ROLE_PHRASE: Record<AssignableRole, { label: string; does: string }> = {
  admin: { label: 'admin', does: 'gestionarás las líneas, el equipo y las API keys.' },
  supervisor: { label: 'supervisor', does: 'coordinarás tus líneas: campañas, contactos y plantillas.' },
  agent: { label: 'agente', does: 'responderás los chats de tus líneas.' },
};

const legal = (
  <p className="text-xs leading-[1.55] text-brand-subtle">
    Al aceptar, aceptas los <span className="font-semibold text-brand-strong">términos</span> y la{' '}
    <a href="/privacidad.html" className="font-semibold text-brand-accent-strong hover:underline">política de privacidad</a>.
  </p>
);

/** Quién invita, con qué rol y qué líneas verá: en el panel oscuro y, en móvil, arriba del formulario. */
const InvitationSummary = ({ info, compact = false }: { info: InvitationInfo; compact?: boolean }) => {
  const role = ROLE_PHRASE[info.role];
  return (
    <>
      <p className={`${compact ? 'mt-2 text-sm' : 'mt-3.5 text-[15px]'} leading-[1.6] text-brand-green-200`}>
        {info.invitedByName ? `${info.invitedByName} te invitó` : 'Te invitaron'} como{' '}
        <span className="font-bold text-white">{role.label}</span>: {role.does}
      </p>
      {info.lineNames.length > 0 && (
        <div className={`${compact ? 'mt-3' : 'mt-[22px]'} grid gap-2.5`}>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-on-deep-subtle">Tus líneas</div>
          <div className="flex flex-wrap gap-x-[18px] gap-y-2">
            {info.lineNames.map(name => (
              <span key={name} className="inline-flex items-center gap-[7px] text-sm font-semibold text-white">
                <span className="w-[9px] h-[9px] rounded-[2px] bg-brand-accent" />{name}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Aceptar una invitación al equipo (Fase 3; diseño «Wasmish Equipo», marcos 3a
 * a 3e). Pública: el enlace de un solo uso trae el token. El correo es el de
 * la invitación; solo se elige nombre y contraseña, y se entra directo a Chats.
 */
export const AcceptInvitationPage = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { enterSession } = useAuthContext();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const invitation = useQuery({ queryKey: ['invitation', token], queryFn: () => getInvitationService(token), retry: false });
  const accept = useMutation({
    mutationFn: () => acceptInvitationService(token, { name: name.trim(), password }),
    onSuccess: (user) => {
      enterSession(user);
      navigate(`${AppRoutes.private.root}/${AppRoutes.private.chats}`);
    },
  });

  const info = invitation.data;
  const loadError = invitation.isError ? apiErrorOf(invitation.error) : null;
  const acceptError = accept.isError ? apiErrorOf(accept.error) : null;
  const emailTaken = acceptError?.code === TEAM_ERROR.emailTaken;
  // Si el enlace dejó de valer mientras se rellenaba (otro lo usó, caducó), la página entera lo dice.
  const linkError = loadError ?? (acceptError && [TEAM_ERROR.invalid, TEAM_ERROR.expired].includes(acceptError.code as never) ? acceptError : null);
  const expired = linkError?.code === TEAM_ERROR.expired;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accept.isPending) accept.mutate();
  };

  const hero = info && !linkError ? (
    <AuthHero
      title={`${info.accountName ?? 'Un negocio'} te invita a Wasmish`}
      footer={`La invitación caduca el ${formatLineDate(info.expiresAt)}.`}
    >
      <InvitationSummary info={info} />
    </AuthHero>
  ) : (
    <AuthHero title={<>Un número.<br />Todo el equipo.</>}>
      <p className="mt-3.5 max-w-[260px] text-[15px] leading-[1.6] text-brand-green-200">Una sola bandeja para responder a tus clientes.</p>
    </AuthHero>
  );

  return (
    <AuthShell hero={hero}>
      {invitation.isLoading && <p className="text-[15px] text-brand-muted">Cargando la invitación…</p>}

      {linkError && (
        <div className="grid gap-3">
          <h1 className="font-bold text-[30px] leading-[1.15] tracking-[-0.03em] text-brand-text text-pretty">
            {expired ? 'La invitación caducó.' : 'Esta invitación no existe o ya no es válida.'}
          </h1>
          <p className="text-[15px] leading-[1.6] text-brand-muted">
            {expired
              ? 'Pide que te envíen otra. Si ya tienes acceso, entra con tu correo.'
              : 'Si ya la aceptaste, entra con tu correo y contraseña.'}
          </p>
          <div className="mt-4">
            <CustomButton size="lg" onClick={() => navigate(AppRoutes.login)}>Ir a Entrar</CustomButton>
          </div>
        </div>
      )}

      {info && !linkError && (
        <>
          {/* En móvil no hay panel: la invitación va arriba, en el fondo de marca (marco 3e). */}
          <div className="lg:hidden mb-7 rounded-xl bg-brand-deep px-5 py-5">
            <p className="text-white font-bold text-xl leading-[1.25] tracking-[-0.02em] text-pretty">
              {info.accountName ?? 'Un negocio'} te invita a Wasmish
            </p>
            <InvitationSummary info={info} compact />
          </div>

          <h1 className="font-bold text-[30px] leading-none tracking-[-0.03em] text-brand-text">Crea tu acceso</h1>
          <p className="text-brand-muted text-[15px] mt-2">Elige tu nombre y una contraseña.</p>

          <form onSubmit={submit} className="grid gap-[18px] mt-7">
            <AuthField
              label="Correo"
              type="email"
              value={info.email}
              onChange={() => {}}
              readOnly
              error={emailTaken ? acceptError.message : undefined}
              hint={emailTaken
                ? undefined
                : 'Es el correo de la invitación. No se puede cambiar.'}
              labelAction={emailTaken && (
                <Link to={AppRoutes.login} className="text-[13px] font-semibold text-brand-accent-strong hover:underline">Entrar</Link>
              )}
            />
            <AuthField
              label="Nombre completo"
              type="text"
              placeholder="Ana Pérez Molina"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
            <AuthPasswordField
              label="Contraseña"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              showStrength
            />

            {acceptError && !emailTaken && !linkError && (
              <p role="alert" className="flex items-start gap-2 text-[13px] text-brand-danger">
                <AlertCircle size={15} className="flex-none mt-px" />{acceptError.message}
              </p>
            )}

            <CustomButton type="submit" size="lg" isLoading={accept.isPending}>
              {accept.isPending ? 'Entrando…' : 'Aceptar y entrar'}
            </CustomButton>
            {legal}
          </form>
        </>
      )}
    </AuthShell>
  );
};
