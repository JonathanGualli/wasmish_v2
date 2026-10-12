import { Router } from "express";
import { authRequired } from '../middlewares/validate.token.middleware.js';
import { addClient, removeClient } from "../controllers/stream.controller.js";

const router = Router();

router.get('/stream', authRequired, (req, res) => { 
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Credentials': 'true',
    });

    res.flushHeaders?.();

    // Las conexiones se agrupan por cuenta: todo lo que pasa en la cuenta llega
    // a cada pestaña abierta de ella (el filtro por línea y asignación llega con
    // los permisos, en la Fase 3).
    const accountId = req.auth.accountId;
    addClient(accountId, res);

    res.write(': connected\n\n');

    const interval = setInterval(() => {
        try { res.write(': keep-alive\n\n'); } catch (_) {}
    }, 25000);

    req.on('close', () => {
        clearInterval(interval);
        removeClient(accountId, res);
        try {res.end();} catch (_) {}
    });
});

export default router;