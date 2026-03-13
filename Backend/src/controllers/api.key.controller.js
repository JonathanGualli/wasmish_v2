import ApiKey from "../models/api.keys.model.js";
import User from "../models/user.model.js";
import { generateApiKeyUtil } from "../utils/generate.api.key.util.js";
import { encrypt } from "../utils/crypto.js";


export const generateApiKeyController = async (req, res) => {
    try {
        const userId  = req.user.id;
        const { nameApiKey } = req.body;


        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        // console.log("")
        const apiKeyFound = await ApiKey.findOne({ userId, name: nameApiKey });
        if (apiKeyFound) return res.status(400).json([{ message: "API Key already exists" }]);

        const randomApiKey = generateApiKeyUtil(); 
        const encryptedRandomApiKey = encrypt(randomApiKey);
        console.log(randomApiKey);

        const neyKey = new ApiKey({
            userId: user._id,
            key: encryptedRandomApiKey,
            name: nameApiKey,
            status: 'active',
        });

        const apiKeySaved = await neyKey.save();

        return res.json({
            id: apiKeySaved._id,
            key: apiKeySaved.key,
            name: apiKeySaved.name,
            status: apiKeySaved.status,
            createdAt: apiKeySaved.createdAt,
            updatedAt: apiKeySaved.updatedAt,
        });

    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
}