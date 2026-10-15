import test from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_MAX_AGE_MS, sessionCookieOptions, shouldRenewSession } from '../src/utils/session.js';

const AHORA = Date.parse('2026-10-15T12:00:00Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
// `exp` del JWT: en segundos.
const expEn = (ms) => (AHORA + ms) / 1000;

test('un token recién emitido no se renueva', () => {
    assert.equal(shouldRenewSession(expEn(SESSION_MAX_AGE_MS), AHORA), false);
    assert.equal(shouldRenewSession(expEn(SESSION_MAX_AGE_MS - 23 * HORA), AHORA), false);
});

test('un token de más de un día se renueva', () => {
    assert.equal(shouldRenewSession(expEn(SESSION_MAX_AGE_MS - DIA - HORA), AHORA), true);
    assert.equal(shouldRenewSession(expEn(2 * DIA), AHORA), true);
});

// Regresión: los tokens anteriores duraban 24 h. Renovar según la EDAD dejaba
// sin renovar uno de hace una hora, que caducaba a las 23 h y volvía a pedir
// iniciar sesión.
test('un token de 24 h de antes de la regla se renueva aunque sea reciente', () => {
    assert.equal(shouldRenewSession(expEn(23 * HORA), AHORA), true);
});

test('sin exp, se renueva', () => {
    assert.equal(shouldRenewSession(undefined, AHORA), true);
});

// Regresión: sin `maxAge`, la cookie era «de sesión» y el teléfono la perdía
// al cerrar la app, antes incluso de que caducara el token.
test('la cookie dura lo mismo que la sesión', () => {
    assert.equal(sessionCookieOptions(true).maxAge, SESSION_MAX_AGE_MS);
    assert.equal(SESSION_MAX_AGE_MS, 30 * DIA);
});

test('en producción la cookie es segura y entre orígenes; en local, lax', () => {
    assert.deepEqual(
        { ...sessionCookieOptions(true), maxAge: undefined },
        { httpOnly: true, secure: true, sameSite: 'none', maxAge: undefined },
    );
    assert.equal(sessionCookieOptions(false).secure, false);
    assert.equal(sessionCookieOptions(false).sameSite, 'lax');
});
