import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initWidgetSync } from './store/widgets'
import './styles/globals.css'

// Start widget file sync (SSE + polling fallback) before first render
initWidgetSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
