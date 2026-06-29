import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import Home from './pages/Home'

export function render(_url: string): string {
  return renderToString(
    <StaticRouter location="/">
      <Home />
    </StaticRouter>
  )
}
