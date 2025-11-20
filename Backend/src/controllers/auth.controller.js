import { TOKEN_SECRET } from '../config.js';
import { createAccessToken } from '../libs/jwt.js';
import User from '../models/user.model.js'
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { decrypt } from '../utils/crypto.js';


export const register = async (req, res) => {
        
    try {
        const { name, email, password, rol, status } = req.body;
        const userFound = await User.findOne({email});

        if (userFound) return res.status(400).json([{message: 'the email is already in use'}]);

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = new User({
            name, 
            email, 
            password: passwordHash,
            rol,
            status, 
        });

        const userSaved = await newUser.save();

        const token = await createAccessToken({ id: userSaved._id });

        res.cookie('token', token);

        res.json({
            id: userSaved._id,
            name: userSaved.name,
            email: userSaved.email,
            rol: userSaved.rol,
            status: userSaved.status,
            createdAt: userSaved.createdAt,
            updatedAt: userSaved.updatedAt,
        });

    } catch (error) {
        res.status(500).json([error.message]);   
    }
}

export const login = async (req, res) => {
    
    const { email, password } = req.body;

    try { 
        const userFound = await User.findOne({email});

        if(!userFound) return res.status(404).json([{message: 'User not found'}]);

        const isMatch = await bcrypt.compare(password, userFound.password);

        if(!isMatch) return res.status(400).json([{message: 'Invalid credentials'}]);

        const token = await createAccessToken({ id: userFound._id });

        res.cookie('token', token);



        // Desencriptar el token de Whatsapp antes de enviarlo
        const encryptToken = userFound.tokenWhatsapp;
        let decryptToken = "";
        if(encryptToken){
            decryptToken = decrypt(encryptToken); 
        }

        res.json({
            id: userFound._id,
            name: userFound.name,
            email: userFound.email,
            rol: userFound.rol,
            tokenWhatsapp: decryptToken,
            status: userFound.status,
            createdAt: userFound.createdAt,
            updatedAt: userFound.updatedAt,
        });

    } catch (error) {
        return res.status(500).json([error.message]);
    }
}

export const logout =  async (req, res) => {
    res.clearCookie('token', { path: '/' });
    res.json(['Logout successful']);
    console.log('Logout successful');
}

export const profile = async (req, res) => {
    const userFound = await User.findById(req.user.id);

    if(!userFound) return res.status(400).json([{message: 'User not found'}]);

    return res.json({
        id: userFound._id,
        name: userFound.name,
        email: userFound.email,
        rol: userFound.rol,
        status: userFound.status,
        createdAt: userFound.createdAt,
        updatedAt: userFound.updatedAt,
    });
}

export const verifyToken = async (req, res) => {
    const {token} = req.cookies;
    if(!token) return res.status(401).json([{message: 'Unauthorized'}]);

    jwt.verify(token, TOKEN_SECRET, async (err, user) => {
        if(err) return res.status(401).json([{message: 'Unauthorized'}]);

        const userFound = await User.findById(user.id);
        if(!userFound) return res.status(401).json([{message: 'Unauthorized'}]);

        //Desencriptar el token de Whatsapp antes de enviarlo
        const encryptToken = userFound.tokenWhatsapp;
        let decryptToken = "";
        if(encryptToken){
            decryptToken = decrypt(encryptToken); 
        }
        
        return res.json({
            id: userFound._id,
            name: userFound.name,
            email: userFound.email,
            rol: userFound.rol,
            status: userFound.status,
            tokenWhatsapp: decryptToken,
            phoneNumberId: userFound.phoneNumberId ?? "",
        })
    });
}

