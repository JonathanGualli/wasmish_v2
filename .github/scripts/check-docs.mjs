// Comprueba que la documentación de los agentes no se desfase (ver «Claude y
// Codex: un solo sitio para cada cosa» en AGENTS.md):
//   1. los enlaces entre documentos apuntan a archivos y títulos que existen;
//   2. cada archivo de docs/arquitectura/ está en el mapa del AGENTS.md raíz;
//   3. cada CLAUDE.md importa su AGENTS.md (las reglas viven en uno solo).
// Sin dependencias: `node .github/scripts/check-docs.mjs` desde la raíz.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const list = (dir) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.md')).map(f => `${dir}/${f}`);

const DOCS = [
    'AGENTS.md', 'CLAUDE.md', 'Backend/AGENTS.md', 'Backend/CLAUDE.md', 'Frontend/AGENTS.md', 'Frontend/CLAUDE.md',
    ...list('docs'), ...list('docs/arquitectura'),
];
const problems = [];

// El ancla que GitHub pone a un título (github-slugger).
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '').replace(/ /g, '-');
const anchors = new Map();
const anchorsOf = (file) => {
    if (!anchors.has(file)) {
        const titles = [...read(file).matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1].trim()));
        anchors.set(file, new Set(titles));
    }
    return anchors.get(file);
};

// 1. Enlaces
for (const file of DOCS) {
    for (const [, target] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:)/.test(target)) continue;
        const [rawPath, anchor] = target.split('#');
        const dest = rawPath ? path.normalize(path.join(path.dirname(file), rawPath)) : file;
        if (!fs.existsSync(path.join(root, dest))) {
            problems.push(`${file}: enlace a «${target}», que no existe`);
        } else if (anchor && dest.endsWith('.md') && !anchorsOf(dest).has(anchor)) {
            problems.push(`${file}: enlace a «${target}», pero ese título no está en ${dest}`);
        }
    }
}

// 2. El mapa del AGENTS.md raíz nombra cada documento. Solo cuenta la sección
// del mapa: un enlace desde una regla no sirve para encontrar el tema.
const map = read('AGENTS.md').split(/^## /m).find(section => section.startsWith('Mapa')) ?? '';
if (!map) problems.push('AGENTS.md: falta la sección «## Mapa»');
for (const doc of [...list('docs/arquitectura'), 'docs/estado.md', 'docs/decisiones.md']) {
    if (!map.includes(`](${doc})`)) problems.push(`AGENTS.md: el mapa no enlaza ${doc}`);
}

// 3. Cada CLAUDE.md importa su AGENTS.md
if (!read('CLAUDE.md').startsWith('@AGENTS.md')) problems.push('CLAUDE.md: tiene que empezar con @AGENTS.md');
for (const folder of ['Backend', 'Frontend']) {
    if (read(`${folder}/CLAUDE.md`).trim() !== '@AGENTS.md') problems.push(`${folder}/CLAUDE.md: tiene que ser solo @AGENTS.md`);
}

if (problems.length > 0) {
    console.error(`Documentación desfasada (${problems.length}):\n- ${problems.join('\n- ')}`);
    process.exit(1);
}
console.log(`Documentación al día: ${DOCS.length} archivos, enlaces, mapa e imports correctos.`);
