import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

// Servicio para iniciar sesión
export const loginService = async (email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/login`, { email, password }, { withCredentials: true });
    return data;
}

// Servicio para registrarse
export const signUpService = async (name: string, email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/register`, { name, email, password }, { withCredentials: true });
    return data;
}

// Servicio para cerrar sesión
export const logOutService = async () => {
    const { data } = await axios.post(`${API_URL}/logout`, {}, { withCredentials: true });
    return data;
}

// Servicio para verificar la autenticación
export const verifyService = async () => {
    const { data } = await axios.get(`${API_URL}/verify`, { withCredentials: true });
    return data;
}

// Servicio para actualizar el token de whatsapp
export const updateWhatsAppTokenService = async (tokenWhatsapp: string) => {
    const { data } = await axios.put(`${API_URL}/users/update-user-token-whatsapp`, { tokenWhatsapp }, { withCredentials: true });
    return data;
}