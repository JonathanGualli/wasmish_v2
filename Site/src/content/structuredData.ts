import { CONTACT_EMAIL, SITE_URL } from '../site.ts'
import { PRICE } from './price.ts'

// Los datos estructurados del inicio (JSON-LD), para que Google sepa qué es
// Wasmish y cuánto cuesta. El precio sale del mismo dato que muestra la página.
export const HOME_JSON_LD: object[] = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Wasmish',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/brand/logo.png`,
    email: CONTACT_EMAIL,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Wasmish',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    url: `${SITE_URL}/`,
    description: 'El WhatsApp del negocio, con todo el equipo: usuarios individuales, notas compartidas, el nombre de quien respondió y respuestas automáticas.',
    offers: [
      { '@type': 'Offer', price: String(PRICE.regular), priceCurrency: PRICE.currency, description: 'Mensualidad: 1 número de WhatsApp y 3 usuarios.' },
      {
        '@type': 'Offer', price: String(PRICE.founder), priceCurrency: PRICE.currency,
        description: `Oferta de fundador: los primeros ${PRICE.founderMonths} meses, para los primeros ${PRICE.founderSlots} clientes.`,
      },
    ],
  },
]
