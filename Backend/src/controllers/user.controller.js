import User from "../models/user.model.js";
import { encrypt } from "../utils/crypto.js";


export const updateUserTokenWhatsapp = async (req, res) => {
    const { tokenWhatsapp } = req.body;
    const userId = req.user.id;

    console.log("User ID:", userId);

    try {
        const userFound = await User.findById(userId);

        if (!userFound) return res.status(404).json([{ message: 'User not found' }]);

        // Encript the token before saving
        userFound.tokenWhatsapp = encrypt(tokenWhatsapp);

        await userFound.save();

        return res.json({ message: 'Token updated successfully' });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}