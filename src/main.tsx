import '@fontsource-variable/overpass'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import type { Meta } from '../shared/types.ts'
import { App } from './App.tsx'
import { setFlags } from './flags.ts'

async function boot() {
  try {
    const res = await fetch('/api/meta')
    setFlags(((await res.json()) as Meta).flags)
  } catch {
    setFlags([])
  }
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  )
}

void boot()
