export const validateSchema = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (error) {
        if (!error.issues) return res.status(400).json({ message: error.message });

        // Aplanamos el issue de Zod: el `path` iba enterrado y no se veía qué campo falló
        return res.status(400).json(error.issues.map(issue => ({
            field: issue.path.join('.') || '(body)',
            message: issue.message,
        })));
    }
};