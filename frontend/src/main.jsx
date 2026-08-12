import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPWA } from './pwa'
import { watchConnectivity } from './store/netStore'

// Which build is actually running. A service worker keeps serving what it
// already has, so an open tab can run a week-old app after a deploy and every
// symptom of that reads as a bug in the new code. One line in the console
// settles it — and `window.gymistanBuild` is there for asking over the phone.
const BUILD = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
window.gymistanBuild = BUILD
console.info(`Gymistan build ${BUILD}`)

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
