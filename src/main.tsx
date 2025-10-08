import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import { ensurePrefetch } from './utils/prefetchCache'
import { BrowserRouter } from 'react-router-dom'

// Start fetching data as soon as the app loads
ensurePrefetch().catch(err => console.error('Initial prefetch failed', err))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
