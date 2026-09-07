// Sube la versión de la app en un solo comando, escribiéndola en los dos
// package.json a la vez (Backend y Frontend). Es la ÚNICA forma de cambiarla:
// el resto la deriva sola — el front la inyecta al compilar (define de Vite) y
// el back la lee de su package.json al arrancar.
//
//   npm run version:bump 1.0.4      ← versión exacta
//   npm run version:bump patch      ← 1.0.3 → 1.0.4
//   npm run version:bump minor      ← 1.0.3 → 1.1.0
//   npm run version:bump major      ← 1.0.3 → 2.0.0
//
// No commitea ni etiqueta: revisa el diff y commitea tú.
import { readFileSync, writeFileSync } from 'node:fs';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Rutas relativas a este archivo, no al cwd: así funciona desde donde sea.
const PAQUETES = [
    { nombre: 'Backend',  url: new URL('../package.json', import.meta.url) },
    { nombre: 'Frontend', url: new URL('../../Frontend/package.json', import.meta.url) },
];

// Un error aquí es de uso, no un fallo del programa: el stack trace de Node
// solo estorba.
const morir = (mensaje) => {
    console.error(mensaje);
    process.exit(1);
};

const siguiente = (actual, arg) => {
    if (SEMVER.test(arg)) return arg;

    const partes = actual.match(SEMVER);
    if (!partes) morir(`La versión actual "${actual}" no es semver; pásala explícita.`);

    const [major, minor, patch] = partes.slice(1).map(Number);
    if (arg === 'major') return `${major + 1}.0.0`;
    if (arg === 'minor') return `${major}.${minor + 1}.0`;
    if (arg === 'patch') return `${major}.${minor}.${patch + 1}`;

    return morir(`No entiendo "${arg}". Usa una versión (1.0.4) o major | minor | patch.`);
};

const arg = process.argv[2];
if (!arg) morir('Falta la versión.  Uso: npm run version:bump 1.0.4  (o patch | minor | major)');

// Leemos los dos ANTES de escribir ninguno: si el segundo falla, no queremos
// dejar el Backend en 1.0.4 y el Frontend en 1.0.3.
const paquetes = PAQUETES.map(({ nombre, url }) => {
    const texto = readFileSync(url, 'utf8');
    return { nombre, url, texto, json: JSON.parse(texto) };
});

const versiones = new Set(paquetes.map(p => p.json.version));
if (versiones.size > 1) {
    console.warn(`Aviso: estaban desincronizados (${paquetes.map(p => `${p.nombre} ${p.json.version}`).join(', ')}).`);
}

const nueva = siguiente(paquetes[0].json.version, arg);

for (const { nombre, url, texto, json } of paquetes) {
    const anterior = json.version;

    // Reemplazo textual sobre la línea de "version" en vez de reescribir el
    // JSON entero: conserva el formato y el orden de claves del archivo, así el
    // diff del commit es una sola línea.
    const actualizado = texto.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${nueva}"`);
    if (actualizado === texto && anterior !== nueva) {
        morir(`No encontré el campo "version" en el package.json de ${nombre}.`);
    }

    writeFileSync(url, actualizado);
    console.log(`  ${nombre.padEnd(9)} ${anterior} → ${nueva}`);
}

console.log(`\nListo. Revisa el diff y commitea antes de desplegar.`);
