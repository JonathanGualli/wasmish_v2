import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import streamRoutes from './routes/stream.routes.js';
import templateRoutes from './routes/template.routes.js';
import apiKeyRoutes from './routes/api.key.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

// momentanio mientas se sube 
app.set('trust proxy', 1);

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json({
    strict: true, 
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (err) {
            err.statusCode = 400;
            err.body = buf.toString();
            throw err;
        }   
    }
}));

app.use(cookieParser());

app.use("/api", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", chatRoutes);
app.use("/api", webhookRoutes);
app.use("/api", streamRoutes);
app.use("/api", templateRoutes);
app.use("/api", apiKeyRoutes);
app.use("/api", whatsappRoutes);
app.use("/api", adminRoutes);

export default app; 