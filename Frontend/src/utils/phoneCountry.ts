import parsePhoneNumber, { getCountries, getCountryCallingCode, getExampleNumber, type CountryCode } from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';

export type { CountryCode };

export const DEFAULT_COUNTRY: CountryCode = 'EC';

const countryNames = new Intl.DisplayNames(['es'], { type: 'region' });

/** Todos los países, por nombre: «Ecuador (+593)». */
export const COUNTRY_OPTIONS = getCountries()
    .map(code => ({ value: code, label: `${countryNames.of(code) ?? code} (+${getCountryCallingCode(code)})` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));

export const isCountryCode = (value: unknown): value is CountryCode =>
    typeof value === 'string' && (getCountries() as string[]).includes(value);

/** «+593 99 123 4567» a partir de los dígitos que guarda Wasmish; si no se reconoce, con un + delante. */
export const formatInternationalPhone = (digits: string) =>
    parsePhoneNumber(`+${digits}`)?.formatInternational() ?? `+${digits}`;

/** Un celular de ejemplo del país, sin código y con él: «099 123 4567» → «+593 99 123 4567». */
export const countryPhoneExample = (country: CountryCode) => {
    const example = getExampleNumber(country, examples);
    return example ? { local: example.formatNational(), international: example.formatInternational() } : null;
};
