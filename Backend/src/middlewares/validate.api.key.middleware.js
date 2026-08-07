import ApiKey from "../models/api.keys.model.js";
import User from "../models/user.model.js";
import { hashApiKey } from "../utils/crypto.js";

export const validateApiKey = async (req, res, next) => {
    try {
        // 1. Extraer la key del header  ->  Authorization: Bearer wm_xxx
        const authHeader = req.headers['authorization'] || '';
        const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

        if (!apiKey) {
            return res.status(401).json([{ message: "API key requerida (Authorization: Bearer <key>)" }]);
        }

        // 2. Hashear la key entrante y buscarla por su hash
        const keyHash = hashApiKey(apiKey);
        const apiKeyDoc = await ApiKey.findOne({ keyHash });

        if (!apiKeyDoc) return res.status(401).json([{ message: "API key inválida" }]);
        if (apiKeyDoc.status !== 'active') return res.status(403).json([{ message: "API key inactiva" }]);

        // 3. Cargar el usuario dueño de la key
        const user = await User.findById(apiKeyDoc.userId);
        if (!user) return res.status(401).json([{ message: "Usuario asociado no encontrado" }]);

        // 4. Registrar el último uso (sin bloquear la respuesta)
        apiKeyDoc.lastUsedAt = new Date();
        apiKeyDoc.save().catch(() => {});

        // 5. Dejar el usuario en req.user (misma forma que authRequired -> req.user.id)
        req.user = { id: String(user._id) };
        req.apiKey = apiKeyDoc;

        next();
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
