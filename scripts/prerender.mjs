import { build } from 'vite'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// 1. Build SSR bundle
await build({
  root,
  logLevel: 'warn',
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: 'dist-ssr',
    rollupOptions: {
      output: { format: 'esm' },
    },
  },
})

// 2. Render / to HTML string
const { render } = await import(pathToFileURL(resolve(root, 'dist-ssr/entry-server.js')).href)
const appHtml = render('/')

// 3. Keep an un-rendered copy for client-only routes (avoids hydrating
//    the Home markup against a different page's component tree).
const template = readFileSync(resolve(root, 'dist/index.html'), 'utf-8')
if (!template.includes('<!--app-html-->')) {
  throw new Error('index.html is missing the <!--app-html--> placeholder')
}
writeFileSync(resolve(root, 'dist/app.html'), template.replace('<!--app-html-->', ''))

// 4. Inject prerendered Home markup into dist/index.html, served only for /
const html = template.replace('<!--app-html-->', appHtml)
writeFileSync(resolve(root, 'dist/index.html'), html)

// 5. Clean up SSR bundle
rmSync(resolve(root, 'dist-ssr'), { recursive: true, force: true })

console.log('✓ Prerendered / → dist/index.html (other routes → dist/app.html)')
