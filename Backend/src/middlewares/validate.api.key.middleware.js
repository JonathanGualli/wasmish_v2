import ApiKey from "../models/api.keys.model.js";
import Account from "../models/account.model.js";
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

        // 3. Cargar la cuenta dueña de la key. La key es de la CUENTA, no de una
        //    persona: la cuenta conserva su `_id` aunque cambie de owner.
        const account = await Account.findById(apiKeyDoc.userId).select('_id').lean();
        if (!account) return res.status(401).json([{ message: "Cuenta asociada no encontrada" }]);

        // 4. Registrar el último uso (sin bloquear la respuesta)
        apiKeyDoc.lastUsedAt = new Date();
        apiKeyDoc.save().catch(() => {});

        // 5. La sesión de la API: sin persona, toda la cuenta (`lineIds: null` = todas las líneas).
        const accountId = String(account._id);
        req.auth = { userId: null, accountId, role: 'api', lineIds: null, isSuperadmin: false };
        // Provisional, hasta la Tarea 3 del plan de la Fase 1.
        req.user = { id: accountId };
        req.apiKey = apiKeyDoc;

        next();
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
