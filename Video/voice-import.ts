import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseAlignment, type VoiceScene } from './src/lib/voice.ts'
import { MUSIC_FILE, SCENE_ORDER, voiceFile } from './src/story/types.ts'

// npm run voice:import -- <carpeta>
// Lleva la voz grabada al video: desde la carpeta con escena-1.flac + escena-1.json
// … escena-6 y musica.flac (en la memoria privada, comercial/video-voz-elevenlabs/),
// copia el audio a public/ (ignorada por git: el audio no va al repo público) y
// escribe las palabras con sus tiempos en src/story/capacitacion.voice.ts.

const folder = process.argv[2]
if (!folder) {
  console.error('Uso: npm run voice:import -- <carpeta con escena-N.flac y escena-N.json>')
  process.exit(1)
}

const voice: Record<string, VoiceScene> = {}
SCENE_ORDER.forEach((id, i) => {
  const base = path.join(folder, `escena-${i + 1}`)
  for (const file of [`${base}.flac`, `${base}.json`]) {
    if (!existsSync(file)) throw new Error(`Falta ${file} (escena «${id}»).`)
  }
  try {
    voice[id] = parseAlignment(JSON.parse(readFileSync(`${base}.json`, 'utf8')))
  } catch (error) {
    throw new Error(`${base}.json: ${(error as Error).message}`)
  }
  const target = path.join('public', voiceFile(id))
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(`${base}.flac`, target)
})

// La música de fondo, si está en la misma carpeta. Si no, se borra la de una
// importación anterior: si no, el video seguiría sonando con ella (revisión de Codex).
const music = path.join(folder, MUSIC_FILE)
if (existsSync(music)) copyFileSync(music, path.join('public', MUSIC_FILE))
else {
  rmSync(path.join('public', MUSIC_FILE), { force: true })
  console.warn(`Sin ${MUSIC_FILE} en ${folder}: el video saldrá sin música.`)
}

const scenes = SCENE_ORDER.map((id) => {
  const words = voice[id].words.map((w) => `      { text: ${JSON.stringify(w.text)}, start: ${w.start}, end: ${w.end} },`).join('\n')
  return `  ${id}: {\n    end: ${voice[id].end},\n    words: [\n${words}\n    ],\n  },`
}).join('\n')

writeFileSync('src/story/capacitacion.voice.ts', `// Generado por \`npm run voice:import\`: no se edita a mano. Las palabras de la
// voz en cada escena, con sus tiempos en segundos desde el inicio de
// su archivo (alineación de ElevenLabs). El audio no está en el repo.
import type { VoiceScene } from '../lib/voice.ts'
import type { SceneId } from './types.ts'

export const capacitacionVoice: Record<SceneId, VoiceScene> = {
${scenes}
}
`)

for (const id of SCENE_ORDER) console.log(`${id}: ${voice[id].words.length} palabras, ${voice[id].end} s`)
