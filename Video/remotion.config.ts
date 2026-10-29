import path from 'node:path'
import { Config } from '@remotion/cli/config'
import { enableTailwind } from '@remotion/tailwind-v4'

// Los componentes que se importan de Site/ buscarían react y lucide-react en
// Site/node_modules: serían otra copia de React y la pantalla saldría en blanco.
// Se fuerzan los de aquí (el alias de un paquete cubre sus subrutas, como
// react/jsx-runtime). Los scripts corren desde Video/, de ahí `process.cwd()`.
const own = (pkg: string) => path.resolve(process.cwd(), 'node_modules', pkg)

Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config)
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        react: own('react'),
        'react-dom': own('react-dom'),
        'lucide-react': own('lucide-react'),
      },
    },
  }
})
