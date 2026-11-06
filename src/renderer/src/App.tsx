import React, { useEffect } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { TopStatusBar } from './components/TopStatusBar'
import { WorkbenchView } from './components/WorkbenchView'
import { CoordinatorView } from './components/CoordinatorView'
import { KairosView } from './components/KairosView'
import { DocEditorView } from './components/DocEditorView'
import { QuickLauncher } from './components/QuickLauncher'
import { SettingsModal } from './components/SettingsModal'

export const App: React.FC = () => {
  const {
    activeMode,
    initialize,
    toastNotification,
    clearToast,
    setQuickLauncherOpen,
    setSettingsOpen
  } = useAppStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Guard against browser history back/forward navigation in SPA (e.g. trackpad overscroll swipe)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent): void => {
      e.preventDefault()
      window.history.pushState(null, '', window.location.href)
    }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Native macOS keyboard shortcuts: ⌘K for Spotlight QuickLauncher, ⌘, for Settings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setQuickLauncherOpen(true)
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setQuickLauncherOpen, setSettingsOpen])

  // Auto-dismiss Dynamic Island toast after 5 seconds
  useEffect(() => {
    if (!toastNotification) return
    const timer = setTimeout(() => clearToast(), 5000)
    return () => clearTimeout(timer)
  }, [toastNotification, clearToast])

  return (
    <div className="h-screen w-screen flex flex-col bg-white text-[#1d1d1f] overflow-hidden relative">
      {/* Unified macOS Translucent Daylight Header */}
      <TopStatusBar />

      {/* Full-Bleed Apple Editorial Viewport */}
      <main key={activeMode} className="animate-apple-view flex-1 flex overflow-hidden relative z-10">
        {activeMode === 'workbench' && <WorkbenchView />}
        {activeMode === 'coordinator' && <CoordinatorView />}
        {activeMode === 'kairos' && <KairosView />}
        {activeMode === 'doc-editor' && <DocEditorView />}
      </main>

      {/* Apple Dynamic Island Style Floating Notification (Daylight Glass) */}
      {toastNotification && (
        <div className="animate-apple-island fixed top-16 left-1/2 z-50 max-w-md rounded-full apple-glass-Heavy px-4 py-2.5 flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-[#5856D6]/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-[#5856D6]" />
          </div>
          <div className="text-[12px] pr-1 truncate">
            <span className="font-semibold text-[#1d1d1f] mr-1.5">
              {toastNotification.title}
            </span>
            <span className="text-[#6e6e73]">{toastNotification.body}</span>
          </div>
          {toastNotification.actionLabel && toastNotification.onAction && (
            <button
              type="button"
              onClick={toastNotification.onAction}
              className="apple-press px-2.5 py-1 rounded-full bg-[#5856D6] hover:bg-[#4B49C8] text-white text-[11px] font-semibold shrink-0 shadow-sm"
            >
              {toastNotification.actionLabel}
            </button>
          )}
          <button
            onClick={clearToast}
            className="apple-press text-[#86868b] hover:text-[#1d1d1f] p-1 rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Apple Sheets & Spotlight Overlays */}
      <QuickLauncher />
      <SettingsModal />
    </div>
  )
}

export default App
