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

    // Las conexiones se agrupan por cuenta y guardan la sesión: cada evento
    // llega a las pestañas que pueden verlo (sus líneas y permisos, Fase 3).
    const { auth } = req;
    addClient(auth, res);

    res.write(': connected\n\n');

    const interval = setInterval(() => {
        try { res.write(': keep-alive\n\n'); } catch (_) {}
    }, 25000);

    req.on('close', () => {
        clearInterval(interval);
        removeClient(auth, res);
        try {res.end();} catch (_) {}
    });
});

export default router;