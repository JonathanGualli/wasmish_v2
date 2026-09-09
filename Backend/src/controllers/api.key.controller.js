import ApiKey from "../models/api.keys.model.js";
import { generateApiKeyUtil } from "../utils/generate.api.key.util.js";
import { hashApiKey } from "../utils/crypto.js";

export const generateApiKeyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { nameApiKey } = req.body;

        const apiKeyFound = await ApiKey.findOne({ userId, name: nameApiKey });
        if (apiKeyFound) return res.status(400).json([{ message: "Ya tienes una API key con ese nombre" }]);

        const fullKey = generateApiKeyUtil();   // "wm_xxx" en claro
        const keyHash = hashApiKey(fullKey);     // lo que se guarda

        const apiKeySaved = await ApiKey.create({
            userId,
            keyHash,
            keyPreview: `${fullKey.slice(0, 6)}…${fullKey.slice(-4)}`,
            name: nameApiKey,
            status: 'active',
        });

        // ⚠️ Devolvemos la key EN CLARO — SOLO esta vez (no se puede recuperar después)
        return res.status(201).json({
            id: apiKeySaved._id,
            key: fullKey,
            name: apiKeySaved.name,
            status: apiKeySaved.status,
            createdAt: apiKeySaved.createdAt,
        });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};

// Listar las API keys del usuario (nunca se devuelve el hash)
export const listApiKeysController = async (req, res) => {
    try {
        const userId = req.user.id;
        const keys = await ApiKey.find({ userId }).sort({ createdAt: -1 });
        return res.json(keys.map(k => ({
            id: k._id,
            name: k.name,
            keyPreview: k.keyPreview,
            status: k.status,
            lastUsedAt: k.lastUsedAt,
            createdAt: k.createdAt,
        })));
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};

// Revocar (eliminar) una API key del usuario
export const revokeApiKeyController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const deleted = await ApiKey.findOneAndDelete({ _id: id, userId });
        if (!deleted) return res.status(404).json([{ message: "API key no encontrada" }]);
        return res.json({ message: "API key revocada", id });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
