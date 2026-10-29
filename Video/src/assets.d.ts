// Lo que webpack importa y TypeScript no conoce (en Site/ lo declara Vite).
declare module '*.woff2' {
  const url: string
  export default url
}
declare module '*.css'
