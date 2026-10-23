// La clave de un wamid de Meta. Un wamid es `wamid.` + base64 de
// `1C 18 <largo> <destinatario> 15 ?? 00 ?? 18 <largo> <clave> 00`: el
// destinatario (un teléfono o un BSUID) y la clave del mensaje, en hexadecimal.
// Meta puede nombrar el MISMO mensaje con dos wamid: en la coexistencia, el eco
// llega con el BSUID del contacto (`PE.…`) y la reacción del contacto lo cita
// con su teléfono (2026-10-22). La forma no está documentada: lo que no encaja
// exacto devuelve null y quien llama se queda con la búsqueda literal.

const PREFIX = 'wamid.';
// Una clave más corta no basta para dar por igual dos mensajes.
const MIN_KEY_LENGTH = 16;
const HEX = /^[0-9A-F]+$/;

/**
 * @returns {string|null} La clave del mensaje (`3EB0B6D5468D1449B315F0`), o null
 *          si el wamid no tiene exactamente esa forma.
 */
export const wamidMessageKey = (waMessageId) => {
    if (typeof waMessageId !== 'string' || !waMessageId.startsWith(PREFIX)) return null;
    const bytes = Buffer.from(waMessageId.slice(PREFIX.length), 'base64');
    if (bytes[0] !== 0x1c || bytes[1] !== 0x18) return null;

    const at = 3 + bytes[2];
    if (bytes[at] !== 0x15 || bytes[at + 2] !== 0x00 || bytes[at + 4] !== 0x18) return null;
    const keyLength = bytes[at + 5];
    const end = at + 6 + keyLength;
    if (bytes.length !== end + 1 || bytes[end] !== 0x00) return null;

    const key = bytes.subarray(at + 6, end).toString('latin1');
    return key.length >= MIN_KEY_LENGTH && HEX.test(key) ? key : null;
};
