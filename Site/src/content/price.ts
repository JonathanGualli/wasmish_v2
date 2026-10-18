// El precio, de un solo sitio: lo usan la página y el JSON-LD, para que nunca
// se contradigan (decisión comercial de Jonathan, 2026-10-14).
export const PRICE = {
  currency: 'USD',
  regular: 30,
  founder: 20,
  founderMonths: 12,
  founderSlots: 10,
  extraUser: 5,
} as const
