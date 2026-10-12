// Se monta SIEMPRE después de authRequired, que ya leyó el usuario de la BD en
// esta misma petición: quitar `isSuperadmin` tiene efecto inmediato.
export const requireSuperadmin = (req, res, next) => {
    if (!req.auth?.isSuperadmin) return res.status(403).json([{ message: 'Forbidden' }]);
    next();
}
