import mongoose from "mongoose";

// Una etiqueta de la cuenta («VIP», «Feria octubre»). Los contactos la llevan
// por id (`Contact.tags`): renombrarla o borrarla es una sola escritura.
const tagSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Como se escribió la primera vez.
    name: {
        type: String,
        required: true,
    },
    // `tagKey(name)`: sin mayúsculas ni tildes, para que «VIP» y «vip» sean una.
    key: {
        type: String,
        required: true,
    },
}, {
    timestamps: true,
});

tagSchema.index({ userId: 1, key: 1 }, { name: 'tag_key_unique', unique: true });

export default mongoose.model('Tag', tagSchema);
