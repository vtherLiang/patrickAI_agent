/// <reference types="vite/client" />
import { ClaudeDesktopBridge } from '../../preload/index'

declare global {
  interface Window {
    claudeDesktop: ClaudeDesktopBridge
  }
}
