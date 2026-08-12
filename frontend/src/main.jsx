import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPWA } from './pwa'
import { watchConnectivity } from './store/netStore'

// Both before render: the worker is what answers this load's requests if the
// desk opened the app with no line, and the connectivity watch has to be
// listening before the first query goes out.
watchConnectivity()
registerPWA()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
