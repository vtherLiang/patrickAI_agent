import React from 'react'
import ReactDOM from 'react-dom/client'
import { ensureDesktopBridge } from './web-bridge'
import App from './App'
import './assets/main.css'

ensureDesktopBridge()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
