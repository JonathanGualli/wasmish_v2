import { TOKEN_SECRET } from '../config.js';
import { createAccessToken } from '../libs/jwt.js';
import User from '../models/user.model.js'
import { createAccountWithOwner, sessionAccessFor } from '../services/account.service.js';
import { sessionAuthFor } from '../utils/account.js';
import { sessionCookieOptions, shouldRenewSession } from '../utils/session.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

// Abre (o renueva) la sesión en el navegador: un token nuevo de 30 días en la cookie.
const setSessionCookie = async (res, userId) => {
    const token = await createAccessToken({ id: userId });
    res.cookie('token', token, sessionCookieOptions(isProd));
};

// Respuesta única del login. Que un correo no exista y que la contraseña sea
// incorrecta tienen que ser indistinguibles: si no, cualquiera puede averiguar
// qué correos están registrados probándolos uno a uno.
const CREDENCIALES_INVALIDAS = [{ message: 'Correo o contraseña incorrectos' }];

// Hash de descarte contra el que comparar cuando el correo no existe. Sin esto
// la respuesta sería idéntica pero el TIEMPO no: ~1 ms si no hay usuario (no se
// llega a bcrypt) frente a ~100 ms si lo hay. Esa diferencia sola ya permite
// enumerar. Se calcula una vez al arrancar, sobre un valor aleatorio que nadie
// conoce, así que jamás puede casar con una contraseña real.
const HASH_DE_DESCARTE = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

const EMAIL_EN_USO = [{ message: 'the email is already in use' }];


export const register = async (req, res) => {
        
    try {
        // Solo estos tres: el rol, el estado y la cuenta no los elige quien se
        // registra. Siempre es el owner de una cuenta nueva.
        const { name, email, password } = req.body;
        const userFound = await User.findOne({email});

        if (userFound) return res.status(400).json(EMAIL_EN_USO);

        const passwordHash = await bcrypt.hash(password, 10);

        let userSaved;
        try {
            userSaved = await createAccountWithOwner({ name, email, password: passwordHash });
        } catch (error) {
            // El mismo correo registrándose a la vez: el índice único frena al segundo.
            if (error.code === 11000) return res.status(400).json(EMAIL_EN_USO);
            throw error;
        }

        await setSessionCookie(res, userSaved._id);

        res.json({
            id: userSaved._id,
            name: userSaved.name,
            email: userSaved.email,
            rol: userSaved.rol,
            isSuperadmin: userSaved.isSuperadmin,
            status: userSaved.status,
            createdAt: userSaved.createdAt,
            updatedAt: userSaved.updatedAt,
            ...await sessionAccessFor(userSaved),
        });

    } catch (error) {
        res.status(500).json([error.message]);   
    }
}

/**
 * Abre la sesión de `user`: la cookie y la respuesta del login. La usan el
 * login y aceptar una invitación (Fase 3), que entra directamente.
 */
export const startSession = async (res, user) => {
    await setSessionCookie(res, user._id);

    return res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        rol: user.rol,
        isSuperadmin: user.isSuperadmin,
        whatsappConnected: Boolean(user.tokenWhatsapp),
        phoneNumberId: user.phoneNumberId ?? "",
        waBusinessId: user.waBusinessId ?? "",
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...await sessionAccessFor(user),
    });
};

export const login = async (req, res) => {
    
    const { email, password } = req.body;

    try { 
        const userFound = await User.findOne({email});

        // Se compara SIEMPRE, exista el usuario o no, para que las dos ramas
        // cuesten lo mismo. Mismo estado y mismo mensaje en ambos casos.
        const isMatch = await bcrypt.compare(password, userFound?.password ?? HASH_DE_DESCARTE);

        if(!userFound || !isMatch) return res.status(400).json(CREDENCIALES_INVALIDAS);

        // Solo después de comprobar la contraseña: con una incorrecta, un usuario
        // desactivado recibe lo mismo que un correo que no existe.
        if (userFound.status === 'inactive') {
            return res.status(403).json([{ message: 'Tu usuario está desactivado. Habla con el administrador de tu cuenta.' }]);
        }

        return startSession(res, userFound);

    } catch (error) {
        return res.status(500).json([error.message]);
    }
}

export const logout =  async (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json(['Logout successful']);
}

export const profile = async (req, res) => {
    const userFound = await User.findById(req.auth.userId);

    if(!userFound) return res.status(400).json([{message: 'User not found'}]);

    return res.json({
        id: userFound._id,
        name: userFound.name,
        email: userFound.email,
        rol: userFound.rol,
        isSuperadmin: userFound.isSuperadmin,
        status: userFound.status,
        createdAt: userFound.createdAt,
        updatedAt: userFound.updatedAt,
    });
}

export const verifyToken = async (req, res) => {
    const {token} = req.cookies;
    if(!token) return res.status(401).json([{message: 'Unauthorized'}]);

    jwt.verify(token, TOKEN_SECRET, async (err, user) => {
        if(err) return res.status(401).json([{message: 'Unauthorized'}]);

        const userFound = await User.findById(user.id);
        // Lo mismo que authRequired: inexistente, desactivado o sin cuenta, fuera.
        if(!sessionAuthFor(userFound)) return res.status(401).json([{message: 'Unauthorized'}]);

        // Abrir la app alarga la sesión: solo pide entrar otra vez tras 30 días sin abrirla.
        if (shouldRenewSession(user.exp)) await setSessionCookie(res, userFound._id);

        return res.json({
            id: userFound._id,
            name: userFound.name,
            email: userFound.email,
            rol: userFound.rol,
            isSuperadmin: userFound.isSuperadmin,
            status: userFound.status,
            whatsappConnected: Boolean(userFound.tokenWhatsapp),
            phoneNumberId: userFound.phoneNumberId ?? "",
            waBusinessId: userFound.waBusinessId ?? "",
            // Qué puede hacer y qué ve (Fase 3): el frontend decide con esto qué enseña.
            ...await sessionAccessFor(userFound),
        })
    });
}

