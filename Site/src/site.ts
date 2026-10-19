// Datos fijos de la página. Un `null` es un hueco: se dibuja con <Pending>
// («pendiente») hasta que Jonathan dé el dato, y LAUNCHED no se enciende
// mientras quede alguno (tests/output/pending.test.mjs).

export const SITE_URL = 'https://wasmish.com'
export const APP_LOGIN_URL = 'https://app.wasmish.com/login'
export const CONTACT_EMAIL = 'hola@wasmish.com'

// El número del botón «Pedir una demostración», sin «+» ni espacios (593…).
export const WHATSAPP_NUMBER: string | null = null

// Se enciende en el PR del lanzamiento. Desde entonces, un hueco hace fallar el CI.
export const LAUNCHED: boolean = false
