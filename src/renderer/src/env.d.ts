/// <reference types="vite/client" />
import React from 'react'
import { ClaudeDesktopBridge } from '../../preload/index'

declare global {
  interface Window {
    claudeDesktop: ClaudeDesktopBridge
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        allowpopups?: string | boolean
        webpreferences?: string
        autosize?: string | boolean
        useragent?: string
      }
    }
  }
}
