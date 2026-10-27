import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Account from "../models/account.model.js";
import Invitation from "../models/invitation.model.js";
import Line from "../models/line.model.js";
import User from "../models/user.model.js";
import { withAccountLock } from "../services/account.lock.service.js";
import { disconnectUser } from "./stream.controller.js";
import { releaseAssignments } from "../services/assignment.service.js";
import { startSession } from "./auth.controller.js";
import { hashApiKey } from "../utils/crypto.js";
import { escapeRegex } from "../utils/contact.query.js";
import { lineDisplayName } from "../utils/line.js";
import { LINE_NOT_FOUND_MESSAGE } from "../utils/whatsapp.line.js";
import { hasFreeSeat, invitationExpiresAt, memberChangeIssue, seatsUsed, userLimitMessage } from "../utils/team.js";

// ---------------------------------------------------------------------------
// El equipo de una cuenta (Fase 3 de multi-línea): quién entra, con qué rol y a
// qué líneas, y las invitaciones con enlace de un solo uso. Lo gestionan el
// owner y los admins (`team.manage`); aceptar una invitación es público.
// ---------------------------------------------------------------------------

export const TEAM_BUSY_MESSAGE = 'Hay otro cambio en esta cuenta en curso. Inténtalo de nuevo en unos segundos.';
export const EMAIL_TAKEN_MESSAGE = 'Ese correo ya tiene una cuenta en Wasmish.';
export const INVITATION_INVALID_MESSAGE = 'Esta invitación no existe o ya no es válida.';
export const INVITATION_EXPIRED_MESSAGE = 'La invitación caducó. Pide que te envíen otra.';
const CHOOSE_LINES_MESSAGE = 'Elige al menos una línea';
const MEMBER_ISSUE = {
    owner_locked: [403, 'No se puede cambiar al owner de la cuenta.'],
    self_change: [403, 'No puedes cambiar tu propio rol ni tu estado.'],
    invalid_role: [400, 'Elige un rol: admin, supervisor o agente'],
};

// Un reclamo de aceptación más viejo que esto (el proceso murió a medias) se puede volver a tomar.
const STALE_CLAIM_MS = 60 * 1000;

const statusError = (statusCode, message, code = null) => Object.assign(new Error(message), { statusCode, code });

const sendError = (res, error) => {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Equipo:', error.message);
    return res.status(status).json([{ message: error.message, code: error.code ?? null }]);
};

// Lo que puede ocupar una plaza (invitar, reactivar), de uno en uno por cuenta.
const withTeamLock = (accountId, fn) => withAccountLock(accountId, 'teamLock', fn, {
    onBusy: () => statusError(409, TEAM_BUSY_MESSAGE, 'team_busy'),
});

const pendingInvitation = (now = new Date()) => ({ acceptedAt: null, expiresAt: { $gt: now } });

// Sin nadie aceptándola ahora mismo: sin reclamo, o con uno viejo (el proceso murió).
const notBeingAccepted = (now = new Date()) => ({
    $or: [{ claimedAt: null }, { claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } }],
});

const INVITATION_BUSY_MESSAGE = 'Esta invitación se está aceptando ahora mismo.';

const countSeats = async (accountId) => {
    const [activeUsers, pendingInvitations] = await Promise.all([
        User.countDocuments({ accountId, status: { $ne: 'inactive' } }),
        Invitation.countDocuments({ accountId, ...pendingInvitation() }),
    ]);
    return { activeUsers, pendingInvitations };
};

const maxUsersOf = async (accountId) =>
    (await Account.findById(accountId).select('limits').lean())?.limits?.maxUsers ?? 1;

// Dentro del candado del equipo: 409 si no cabe una persona más.
const assertFreeSeat = async (accountId) => {
    const maxUsers = await maxUsersOf(accountId);
    if (!hasFreeSeat({ ...await countSeats(accountId), maxUsers })) {
        throw statusError(409, userLimitMessage(maxUsers), 'user_limit');
    }
};

// Las líneas tienen que ser de la cuenta (404 si alguna no lo es); sin repetir.
const ownedLineIds = async (accountId, lineIds = []) => {
    const unique = [...new Set(lineIds.map(String))];
    if (unique.length === 0) return [];
    const found = await Line.countDocuments({ _id: { $in: unique }, accountId });
    if (found !== unique.length) throw statusError(404, LINE_NOT_FOUND_MESSAGE, 'line_not_found');
    return unique.map(id => new mongoose.Types.ObjectId(id));
};

// El correo de cualquier usuario de Wasmish, sin distinguir mayúsculas (un correo, una persona).
const emailTaken = (email) => User.exists({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });

const serializeMember = (user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    lineIds: (user.lineIds ?? []).map(String),
    status: user.status ?? 'active',
    createdAt: user.createdAt,
});

const serializeInvitation = (invitation, invitedByName = null) => ({
    id: String(invitation._id),
    email: invitation.email,
    role: invitation.role,
    lineIds: (invitation.lineIds ?? []).map(String),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    invitedByName,
});

/** GET /team — las personas de la cuenta, las invitaciones pendientes y las plazas. */
export const listTeam = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const [members, invitations, maxUsers] = await Promise.all([
            User.find({ accountId }).select('name email role lineIds status createdAt').sort({ createdAt: 1 }).lean(),
            Invitation.find({ accountId, ...pendingInvitation() }).sort({ createdAt: 1 }).lean(),
            maxUsersOf(accountId),
        ]);
        const nameOf = new Map(members.map(member => [String(member._id), member.name]));
        const activeUsers = members.filter(member => member.status !== 'inactive').length;

        return res.json({
            members: members.map(serializeMember),
            invitations: invitations.map(invitation => serializeInvitation(invitation, nameOf.get(String(invitation.invitedBy)) ?? null)),
            maxUsers,
            seatsUsed: seatsUsed({ activeUsers, pendingInvitations: invitations.length }),
        });
    } catch (error) {
        return sendError(res, error);
    }
};

/**
 * POST /team/invitations — crea el enlace. El token sale UNA vez, como una API
 * key: se guarda su hash. Volver a invitar un correo con una invitación
 * pendiente la reemplaza (el enlace viejo deja de valer) sin ocupar otra plaza.
 */
export const inviteMember = async (req, res) => {
    try {
        const { accountId, userId } = req.auth;
        const email = req.body.email.trim().toLowerCase();
        const { role } = req.body;
        const lineIds = role === 'admin' ? [] : await ownedLineIds(accountId, req.body.lineIds);

        if (await emailTaken(email)) throw statusError(409, EMAIL_TAKEN_MESSAGE, 'email_taken');

        const token = crypto.randomBytes(24).toString('base64url');
        const fields = {
            role, lineIds, tokenHash: hashApiKey(token), expiresAt: invitationExpiresAt(), claimedAt: null, invitedBy: userId,
        };

        const invitation = await withTeamLock(accountId, async () => {
            // Reemplazar la pendiente, salvo que alguien la esté aceptando: su
            // aceptación usa el rol y las líneas que reclamó (revisión de Codex del PR #36).
            const existing = await Invitation.findOneAndUpdate(
                { accountId, email, ...pendingInvitation(), ...notBeingAccepted() },
                { $set: fields },
                { new: true },
            ).lean();
            if (existing) return existing;
            if (await Invitation.exists({ accountId, email, ...pendingInvitation() })) {
                throw statusError(409, INVITATION_BUSY_MESSAGE, 'invitation_busy');
            }
            await assertFreeSeat(accountId);
            return (await Invitation.create({ accountId, email, ...fields })).toObject();
        });

        return res.status(201).json({ invitation: serializeInvitation(invitation, req.auth.name ?? null), token });
    } catch (error) {
        return sendError(res, error);
    }
};

/** DELETE /team/invitations/:id — la anula y libera su plaza. */
export const revokeInvitation = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) throw statusError(404, 'La invitación no existe.', 'invitation_not_found');
        const own = { _id: id, accountId: req.auth.accountId, acceptedAt: null };
        // No mientras alguien la acepta: su plaza la va a ocupar (revisión de Codex del PR #36).
        const result = await Invitation.deleteOne({ ...own, ...notBeingAccepted() });
        if (result.deletedCount === 0) {
            if (await Invitation.exists(own)) throw statusError(409, INVITATION_BUSY_MESSAGE, 'invitation_busy');
            throw statusError(404, 'La invitación no existe.', 'invitation_not_found');
        }
        return res.status(204).end();
    } catch (error) {
        return sendError(res, error);
    }
};

/**
 * PATCH /team/members/:id — rol, líneas y/o estado. Reactivar ocupa una plaza.
 * Cualquier cambio cierra sus conexiones SSE: la sesión que guardan ya no vale.
 */
export const updateMember = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const { id } = req.params;
        const target = mongoose.isValidObjectId(id) ? await User.findOne({ _id: id, accountId }).lean() : null;
        if (!target) throw statusError(404, 'Esa persona no está en tu cuenta.', 'member_not_found');

        const change = { role: req.body.role, lineIds: req.body.lineIds, status: req.body.status };
        const issue = memberChangeIssue({
            actor: { id: req.auth.userId, role: req.auth.role },
            target: { id: String(target._id), role: target.role },
            change,
        });
        if (issue) throw statusError(MEMBER_ISSUE[issue][0], MEMBER_ISSUE[issue][1], issue);

        const role = change.role ?? target.role;
        const set = {};
        if (change.role !== undefined) set.role = change.role;
        if (role === 'admin') set.lineIds = [];
        else if (change.lineIds !== undefined) set.lineIds = await ownedLineIds(accountId, change.lineIds);
        const lineCount = set.lineIds?.length ?? target.lineIds?.length ?? 0;
        // Al cambiar el rol o las líneas: un supervisor o agente sin líneas no vería nada.
        const accessChanged = change.role !== undefined || change.lineIds !== undefined;
        if (accessChanged && role !== 'admin' && lineCount === 0) throw statusError(400, CHOOSE_LINES_MESSAGE, 'choose_lines');
        if (change.status !== undefined) set.status = change.status;

        const apply = async () => {
            // Activar puede ocupar una plaza: dentro del candado se relee el
            // estado (el de arriba pudo cambiar entretanto; revisión de Codex del PR #36).
            if (change.status === 'active') {
                const current = await User.findOne({ _id: target._id, accountId }).select('status').lean();
                if (current?.status === 'inactive') await assertFreeSeat(accountId);
            }
            const saved = await User.findOneAndUpdate({ _id: target._id, accountId }, { $set: set }, { new: true })
                .select('name email role lineIds status createdAt').lean();
            // Lo que ya no puede atender vuelve a sin asignar (Fase 4), con el
            // acceso que se acaba de guardar y dentro del candado: un cambio
            // posterior (reactivarlo) no puede colarse entre guardar y soltar, y
            // una liberación retrasada no borra lo que ya vuelve a valer
            // (revisión de Codex del PR #144). Con su cuenta: sin ella,
            // `releaseFilter` lo tomaría por desactivado y soltaría todas.
            await releaseAssignments(accountId, { ...saved, accountId });
            return saved;
        };
        // Todo cambio de un miembro, con el candado del equipo: activar ocupa
        // una plaza, y cualquier cambio de acceso suelta conversaciones.
        const updated = await withTeamLock(accountId, apply);

        disconnectUser(String(target._id));
        return res.json(serializeMember(updated));
    } catch (error) {
        return sendError(res, error);
    }
};

// --- Aceptar la invitación (público) -------------------------------------------

/** La invitación de ese enlace si sigue valiendo; si no, el error que toca (404 o 410). */
const findUsableInvitation = async (token) => {
    const invitation = await Invitation.findOne({ tokenHash: hashApiKey(String(token)) }).lean();
    if (!invitation || invitation.acceptedAt) throw statusError(404, INVITATION_INVALID_MESSAGE, 'invitation_invalid');
    if (invitation.expiresAt <= new Date()) throw statusError(410, INVITATION_EXPIRED_MESSAGE, 'invitation_expired');
    return invitation;
};

/** GET /invitations/:token — lo que enseña la página de aceptar. Nada de otra cuenta ni el token. */
export const getInvitation = async (req, res) => {
    try {
        const invitation = await findUsableInvitation(req.params.token);
        const [account, inviter, lines] = await Promise.all([
            Account.findById(invitation.accountId).select('name').lean(),
            User.findOne({ _id: invitation.invitedBy, accountId: invitation.accountId }).select('name').lean(),
            Line.find({ _id: { $in: invitation.lineIds }, accountId: invitation.accountId }).sort({ createdAt: 1 }).lean(),
        ]);
        return res.json({
            email: invitation.email,
            accountName: account?.name ?? null,
            role: invitation.role,
            invitedByName: inviter?.name ?? null,
            lineNames: lines.map(lineDisplayName),
            expiresAt: invitation.expiresAt,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

/**
 * POST /invitations/:token/accept — crea la persona y entra (como el login).
 * La invitación se RECLAMA (`claimedAt`) en vez de marcarse aceptada: sigue
 * pendiente, ocupando su plaza, hasta que el usuario existe (revisión de Codex
 * del plan). Si crear el usuario falla, se suelta y el enlace sigue valiendo.
 */
export const acceptInvitation = async (req, res) => {
    try {
        const tokenHash = hashApiKey(String(req.params.token));
        const now = new Date();
        const invitation = await Invitation.findOneAndUpdate(
            { tokenHash, ...pendingInvitation(now), ...notBeingAccepted(now) },
            { $set: { claimedAt: now } },
            { new: true },
        ).lean();
        if (!invitation) {
            await findUsableInvitation(req.params.token); // lanza 404 o 410
            throw statusError(409, INVITATION_BUSY_MESSAGE, 'invitation_busy');
        }

        let user;
        try {
            const password = await bcrypt.hash(req.body.password, 10);
            user = await User.create({
                name: req.body.name, email: invitation.email, password,
                accountId: invitation.accountId, role: invitation.role, lineIds: invitation.lineIds, status: 'active',
            });
        } catch (error) {
            await Invitation.updateOne({ _id: invitation._id, claimedAt: now }, { $set: { claimedAt: null } });
            if (error.code === 11000) throw statusError(409, EMAIL_TAKEN_MESSAGE, 'email_taken');
            throw error;
        }
        // Se cierra la invitación que se reclamó, con su token y su reclamo: si
        // otro la cambió entretanto (un reclamo que caducó), el usuario no vale.
        const closed = await Invitation.updateOne(
            { _id: invitation._id, tokenHash, claimedAt: now, acceptedAt: null },
            { $set: { acceptedAt: new Date() } },
        );
        if (closed.modifiedCount === 0) {
            await User.deleteOne({ _id: user._id });
            throw statusError(409, INVITATION_INVALID_MESSAGE, 'invitation_invalid');
        }

        return startSession(res, user);
    } catch (error) {
        return sendError(res, error);
    }
};
