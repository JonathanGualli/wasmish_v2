import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import streamRoutes from './routes/stream.routes.js';

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
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

export default app; 