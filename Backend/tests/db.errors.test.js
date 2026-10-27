import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { isTransientDbError } from '../src/utils/db.errors.js';

// Las clases del driver que usa Mongoose: `mongodb` no es dependencia directa.
const { MongoNetworkError, MongoServerError, MongoServerSelectionError } = mongoose.mongo;

test('isTransientDbError: sin red o sin servidor, es una caída de la BD', () => {
    assert.equal(isTransientDbError(new MongoNetworkError('connection reset')), true);
    assert.equal(isTransientDbError(new MongoServerSelectionError('Server selection timed out', {})), true);
    assert.equal(isTransientDbError({ name: 'MongoNotConnectedError' }), true);
});

test('isTransientDbError: el primario cambió (por código o por etiqueta)', () => {
    assert.equal(isTransientDbError(new MongoServerError({ code: 10107, errmsg: 'not primary' })), true);
    const labeled = new MongoServerError({ code: 1, errmsg: 'x' });
    labeled.addErrorLabel('RetryableWriteError');
    assert.equal(isTransientDbError(labeled), true);
});

test('isTransientDbError: Mongoose se cansó de esperar la conexión', () => {
    const error = new mongoose.Error('Operation `messages.findOne()` buffering timed out after 10000ms');
    assert.equal(isTransientDbError(error), true);
});

// Lo que tiene que seguir dando 200: reentregarlo fallaría igual durante días.
test('isTransientDbError: un mensaje roto o un bug no es una caída de la BD', () => {
    assert.equal(isTransientDbError(new TypeError("Cannot read properties of undefined (reading 'body')")), false);
    assert.equal(isTransientDbError(new mongoose.Error.ValidationError()), false);
    assert.equal(isTransientDbError(new MongoServerError({ code: 11000, errmsg: 'E11000 duplicate key' })), false);
    assert.equal(isTransientDbError(new mongoose.Error('Otro error de Mongoose')), false);
    assert.equal(isTransientDbError(null), false);
});
