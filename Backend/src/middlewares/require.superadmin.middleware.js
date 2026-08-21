import User from "../models/user.model.js";

// Se monta SIEMPRE después de authRequired: asume que req.user.id ya está puesto.
// El rol se lee de la BD en cada request, no del JWT, para que revocar el rol
// tenga efecto inmediato sin esperar a que caduque la cookie.
export const requireSuperadmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('rol');

        if (!user) return res.status(401).json([{ message: 'Unauthorized' }]);
        if (user.rol !== 'superadmin') return res.status(403).json([{ message: 'Forbidden' }]);

        next();
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}
