import React, { useState, useEffect, useRef } from 'react'
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  ExternalLink,
  ChevronDown,
  Search,
  FileSpreadsheet,
  FileText,
  FileCode,
  Image as ImageIcon,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Table,
  Eye,
  FileDown,
  Sparkles,
  Layers,
  Compass,
  Plus,
  X
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { InstalledBrowserInfo, BrowserPreviewItem } from '@shared/types'

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const POPULAR_BOOKMARKS = [
  { name: '百度', url: 'https://www.baidu.com', color: '#2932E1', icon: '百' },
  { name: '必应', url: 'https://www.bing.com', color: '#008373', icon: 'Bing' },
  { name: 'GitHub', url: 'https://github.com', color: '#24292F', icon: 'GH' },
  { name: 'Google', url: 'https://www.google.com', color: '#4285F4', icon: 'G' },
  { name: 'Bilibili', url: 'https://www.bilibili.com', color: '#FB7299', icon: 'Bili' },
  { name: 'YouTube', url: 'https://www.youtube.com', color: '#FF0000', icon: '▶' }
]

const getTabIcon = (tab: { type: string }) => {
  switch (tab.type) {
    case 'web':
      return <Globe className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
    case 'pdf':
      return <FileText className="w-3.5 h-3.5 text-[#FF3B30] shrink-0" />
    case 'docx':
      return <FileText className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
    case 'excel':
      return <FileSpreadsheet className="w-3.5 h-3.5 text-[#34C759] shrink-0" />
    case 'image':
      return <ImageIcon className="w-3.5 h-3.5 text-[#5856D6] shrink-0" />
    default:
      return <FileCode className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
  }
}

interface WebviewTabItemProps {
  tab: BrowserPreviewItem
  isActive: boolean
  isResizing: boolean
  onUpdateTab: (partial: Partial<BrowserPreviewItem>) => void
  onRegisterWebview: (webview: any) => void
  onUnregisterWebview: () => void
  onOpenInExternalBrowser: (url: string) => void
  onLoadingChange?: (loading: boolean) => void
}

const WebviewTabItem: React.FC<WebviewTabItemProps> = ({
  tab,
  isActive,
  isResizing,
  onUpdateTab,
  onRegisterWebview,
  onUnregisterWebview,
  onOpenInExternalBrowser,
  onLoadingChange
}) => {
  const webviewRef = useRef<any>(null)
  const [currentUrl, setCurrentUrl] = useState(tab.url || '')
  const [isWebLoading, setIsWebLoading] = useState(false)
  const [webLoadError, setWebLoadError] = useState<string | null>(null)
  const [startInputUrl, setStartInputUrl] = useState('')

  useEffect(() => {
    if (tab.url && tab.url !== currentUrl) {
      setCurrentUrl(tab.url)
      setWebLoadError(null)
      try {
        if (webviewRef.current && typeof webviewRef.current.loadURL === 'function') {
          webviewRef.current.loadURL(tab.url)
        }
      } catch {
        // ignore
      }
    }
  }, [tab.url])

  useEffect(() => {
    if (webviewRef.current && isActive) {
      onRegisterWebview(webviewRef.current)
    }
  }, [isActive])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    onRegisterWebview(webview)

    const handleStartLoading = () => {
      setIsWebLoading(true)
      setWebLoadError(null)
      onLoadingChange?.(true)
    }
    const handleStopLoading = () => {
      setIsWebLoading(false)
      onLoadingChange?.(false)
      try {
        const url = webview.getURL()
        if (url && url !== currentUrl && !url.startsWith('about:blank')) {
          setCurrentUrl(url)
          onUpdateTab({ url })
        }
      } catch {
        // ignore
      }
    }
    const handlePageTitleUpdated = (e: any) => {
      if (e.title && e.title.trim()) {
        onUpdateTab({ title: e.title.trim() })
      }
    }
    const handleFailLoad = (e: any) => {
      if (e.isMainFrame === false) return
      setIsWebLoading(false)
      onLoadingChange?.(false)
      if (e.errorCode === -3) return

      const failedUrl = e.validatedURL || currentUrl
      try {
        const u = new URL(failedUrl)
        if (!u.hostname.startsWith('www.') && u.hostname.split('.').length === 2) {
          const autoWww = `${u.protocol}//www.${u.hostname}${u.pathname}${u.search}${u.hash}`
          if (autoWww !== currentUrl) {
            console.log(`[BrowserPreview] Auto-retrying with www: ${autoWww}`)
            setCurrentUrl(autoWww)
            onUpdateTab({ url: autoWww })
            setWebLoadError(null)
            return
          }
        }
      } catch {
        // ignore
      }

      setWebLoadError(e.errorDescription || `连接异常 (${e.errorCode})`)
    }

    try {
      webview.addEventListener('did-start-loading', handleStartLoading)
      webview.addEventListener('did-stop-loading', handleStopLoading)
      webview.addEventListener('page-title-updated', handlePageTitleUpdated)
      webview.addEventListener('did-fail-load', handleFailLoad)
    } catch {
      // ignore
    }

    return () => {
      onUnregisterWebview()
      try {
        webview.removeEventListener('did-start-loading', handleStartLoading)
        webview.removeEventListener('did-stop-loading', handleStopLoading)
        webview.removeEventListener('page-title-updated', handlePageTitleUpdated)
        webview.removeEventListener('did-fail-load', handleFailLoad)
      } catch {
        // ignore
      }
    }
  }, [currentUrl])

  const handleStartNavigate = (targetUrl: string) => {
    let clean = targetUrl.trim()
    if (!clean) return
    if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('file://')) {
      const hostPart = clean.split('/')[0]
      if (
        !hostPart.startsWith('www.') &&
        !hostPart.includes(':') &&
        !hostPart.includes('localhost') &&
        hostPart.split('.').length === 2
      ) {
        clean = `www.${clean}`
      }
      clean = `https://${clean}`
    }
    setCurrentUrl(clean)
    setWebLoadError(null)
    onUpdateTab({ url: clean, title: clean.replace(/^https?:\/\//, '') })
  }

  // 1. New Tab / Empty Start Page (when tab has no URL yet)
  if (!currentUrl || currentUrl === 'about:blank') {
    return (
      <div
        style={{ display: isActive ? 'flex' : 'none' }}
        className="flex-1 w-full h-full min-h-0 flex-col items-center justify-center p-6 text-center bg-[#FBFBFD] overflow-y-auto select-none"
      >
        <div className="w-13 h-13 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center mb-3 shadow-xs">
          <Globe className="w-6 h-6" />
        </div>
        <h4 className="text-[14.5px] font-semibold text-[#1d1d1f] mb-1">新建浏览标签页</h4>
        <p className="text-[12px] text-[#86868b] max-w-[280px] mb-4">
          直接输入网址回车，或点击下方常用站点快速访问
        </p>

        {/* Search / URL input bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleStartNavigate(startInputUrl)
          }}
          className="w-full max-w-[320px] flex items-center gap-1.5 p-1 rounded-xl bg-white border border-black/[0.1] shadow-xs mb-5 focus-within:border-[#0071e3]"
        >
          <Search className="w-3.5 h-3.5 text-[#86868b] shrink-0 ml-1.5" />
          <input
            type="text"
            value={startInputUrl}
            onChange={(e) => setStartInputUrl(e.target.value)}
            placeholder="输入网址 (如 bilibili.com)..."
            className="flex-1 bg-transparent text-[12px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!startInputUrl.trim()}
            className="apple-press px-2.5 py-1 rounded-lg bg-[#0071e3] text-white text-[11px] font-medium disabled:opacity-40 shrink-0"
          >
            前往
          </button>
        </form>

        {/* Quick Bookmarks */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-[320px]">
          {POPULAR_BOOKMARKS.map((bm) => (
            <button
              key={bm.name}
              type="button"
              onClick={() => handleStartNavigate(bm.url)}
              className="apple-press flex flex-col items-center justify-center p-2.5 rounded-xl bg-white border border-black/[0.06] hover:border-black/[0.15] hover:shadow-xs transition-all group"
            >
              <div
                style={{ backgroundColor: `${bm.color}15`, color: bm.color }}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] mb-1 group-hover:scale-105 transition-transform"
              >
                {bm.icon}
              </div>
              <span className="text-[11px] font-medium text-[#1d1d1f] truncate max-w-full">
                {bm.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // 2. Active Webview Content
  return (
    <div
      style={{ display: isActive ? 'flex' : 'none' }}
      className="flex-1 w-full h-full min-h-0 flex-col overflow-hidden bg-white"
    >
      {/* Loading stripe */}
      {isWebLoading && (
        <div className="h-0.5 w-full bg-[#0071e3]/20 overflow-hidden shrink-0">
          <div className="h-full bg-[#0071e3] animate-pulse w-2/3" />
        </div>
      )}

      {/* Error banner */}
      {webLoadError && (
        <div className="p-2.5 bg-[#FF9500]/10 border-b border-[#FF9500]/20 flex items-center justify-between text-[11px] text-[#C96A00] gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold shrink-0">访问提示:</span>
            <span className="truncate">
              {webLoadError.includes('ERR_CONNECTION_CLOSED')
                ? '远程服务器关闭了连接 (部分网站如 baidu.com 须使用 www.baidu.com 访问)'
                : webLoadError}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!currentUrl.includes('www.') && (
              <button
                type="button"
                onClick={() => {
                  try {
                    const u = new URL(currentUrl)
                    const wwwUrl = `${u.protocol}//www.${u.hostname}${u.pathname}${u.search}${u.hash}`
                    setCurrentUrl(wwwUrl)
                    onUpdateTab({ url: wwwUrl })
                    setWebLoadError(null)
                  } catch {
                    // ignore
                  }
                }}
                className="apple-press font-semibold underline text-[#0071e3]"
              >
                加上 www. 访问
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setWebLoadError(null)
                webviewRef.current?.reload()
              }}
              className="apple-press font-semibold underline text-[#1d1d1f]"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => onOpenInExternalBrowser(currentUrl)}
              className="apple-press font-semibold underline text-[#0071e3]"
            >
              在外部浏览器中打开
            </button>
          </div>
        </div>
      )}

      {/* Webview Tag */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-white">
        <webview
          ref={webviewRef}
          src={currentUrl}
          className="w-full h-full border-0"
          allowpopups={true}
          useragent={DESKTOP_CHROME_UA}
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: isResizing ? 'none' : 'auto'
          }}
        />
      </div>
    </div>
  )
}

export const CodexBrowserPreview: React.FC = () => {
  const {
    previewTabs,
    activePreview: storeActivePreview,
    closePreviewTab,
    setActivePreviewTab,
    createNewWebTab,
    updatePreviewTab,
    closeAllPreviewTabs,
    openWebPreview,
    stageContentForDocEditor,
    setWorkbenchSubView,
    isInspectorExpanded,
    toggleInspectorExpanded,
    isInspectorResizing
  } = useAppStore()

  // Resolved active preview (fallback to first tab if exists)
  const activePreview = storeActivePreview || (previewTabs.length > 0 ? previewTabs[0] : null)

  // Installed Browsers on User Machine
  const [installedBrowsers, setInstalledBrowsers] = useState<InstalledBrowserInfo[]>([
    { id: 'default', name: '系统默认浏览器', isDefault: true, available: true }
  ])
  const [isBrowserMenuOpen, setIsBrowserMenuOpen] = useState(false)
  const browserMenuRef = useRef<HTMLDivElement>(null)

  // Map of tabId -> webview DOM instance
  const webviewInstancesRef = useRef<Map<string, any>>(new Map())

  // Web Browser State
  const [urlInput, setUrlInput] = useState('')
  const [activeTabLoading, setActiveTabLoading] = useState(false)

  // Document/Image View State
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)
  const [excelSearchQuery, setExcelSearchQuery] = useState('')
  const [docxViewMode, setDocxViewMode] = useState<'html' | 'text'>('html')
  const [pdfViewMode, setPdfViewMode] = useState<'embed' | 'text'>('embed')
  const [imageZoom, setImageZoom] = useState(1)
  const [copiedText, setCopiedText] = useState(false)
  const [customUrlInput, setCustomUrlInput] = useState('')

  // Load installed browsers once on mount
  useEffect(() => {
    let isMounted = true
    if (window.claudeDesktop?.listInstalledBrowsers) {
      window.claudeDesktop
        .listInstalledBrowsers()
        .then((browsers) => {
          if (isMounted && Array.isArray(browsers) && browsers.length > 0) {
            setInstalledBrowsers(browsers)
          }
        })
        .catch(() => {
          // ignore
        })
    }
    return () => {
      isMounted = false
    }
  }, [])

  // Close browser menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (browserMenuRef.current && !browserMenuRef.current.contains(e.target as Node)) {
        setIsBrowserMenuOpen(false)
      }
    }
    if (isBrowserMenuOpen) {
      window.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isBrowserMenuOpen])

  // Sync activePreview changes to top address bar and view states
  useEffect(() => {
    if (activePreview?.type === 'web') {
      setUrlInput(activePreview.url || '')
    }
    setActiveSheetIndex(0)
    setExcelSearchQuery('')
    setImageZoom(1)
    if (activePreview?.type === 'docx') {
      setDocxViewMode(activePreview.htmlContent ? 'html' : 'text')
    }
    if (activePreview?.type === 'pdf') {
      setPdfViewMode('embed')
    }
  }, [activePreview?.id, activePreview?.type, activePreview?.url])

  const handleLaunchInBrowser = async (browser: InstalledBrowserInfo, explicitUrl?: string) => {
    setIsBrowserMenuOpen(false)
    let targetUrl = explicitUrl || (activePreview?.type === 'web' ? activePreview.url : '')
    if (!targetUrl && activePreview?.filePath) {
      targetUrl = `file://${activePreview.filePath}`
    } else if (!targetUrl && activePreview?.url) {
      targetUrl = activePreview.url
    }

    if (!targetUrl) return

    if (window.claudeDesktop?.openInBrowser) {
      await window.claudeDesktop.openInBrowser({
        browserId: browser.id,
        url: targetUrl,
        appPath: browser.appPath
      })
    }
  }

  const handleOpenInSystemApp = async () => {
    if (activePreview?.filePath && window.claudeDesktop?.openPathInApp) {
      await window.claudeDesktop.openPathInApp(activePreview.filePath)
    }
  }

  const handleNavigateWeb = (e: React.FormEvent) => {
    e.preventDefault()
    let raw = urlInput.trim()
    if (!raw) return
    if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('file://')) {
      const hostPart = raw.split('/')[0]
      if (
        !hostPart.startsWith('www.') &&
        !hostPart.includes(':') &&
        !hostPart.includes('localhost') &&
        hostPart.split('.').length === 2
      ) {
        raw = `www.${raw}`
      }
      raw = `https://${raw}`
    }
    setUrlInput(raw)
    if (activePreview) {
      updatePreviewTab(activePreview.id, { url: raw, title: raw.replace(/^https?:\/\//, '') })
      const activeWv = webviewInstancesRef.current.get(activePreview.id)
      if (activeWv && typeof activeWv.loadURL === 'function') {
        try {
          activeWv.loadURL(raw)
        } catch {
          // ignore
        }
      }
    }
  }

  const handleCopyText = (content: string) => {
    navigator.clipboard?.writeText(content)
    setCopiedText(true)
    setTimeout(() => setCopiedText(false), 1800)
  }

  const activeWebview = activePreview?.id ? webviewInstancesRef.current.get(activePreview.id) : null

  // 1. EMPTY / WELCOME STATE
  if (!activePreview || previewTabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#FBFBFD] overflow-y-auto select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0071e3]/10 to-[#5856D6]/10 border border-black/[0.06] flex items-center justify-center text-[#0071e3] mb-4 shadow-sm">
          <Compass className="w-7 h-7" />
        </div>

        <h3 className="text-[14.5px] font-semibold text-[#1d1d1f] mb-1.5">
          实时侧边多标签浏览工作台
        </h3>
        <p className="text-[12px] text-[#6e6e73] leading-relaxed max-w-[290px] mb-5">
          支持同时打开并保留多个网页、PDF、Word、Excel 表格与图片标签页，点击即可无缝切换浏览。
        </p>

        {/* Quick URL Browser Runner */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (customUrlInput.trim()) {
              openWebPreview(customUrlInput.trim())
              setCustomUrlInput('')
            }
          }}
          className="w-full max-w-[320px] flex items-center gap-1.5 p-1 rounded-xl bg-white border border-black/[0.08] shadow-sm mb-4 focus-within:border-[#0071e3]"
        >
          <Globe className="w-3.5 h-3.5 text-[#86868b] shrink-0 ml-1.5" />
          <input
            type="text"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="输入网址直接浏览 (如 bilibili.com)..."
            className="flex-1 bg-transparent text-[11.5px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!customUrlInput.trim()}
            className="apple-press px-2.5 py-1 rounded-lg bg-[#0071e3] text-white text-[11px] font-medium disabled:opacity-40 shrink-0"
          >
            浏览
          </button>
        </form>

        {/* Quick Bookmarks */}
        <div className="grid grid-cols-3 gap-2 w-full max-w-[320px] mb-4">
          {POPULAR_BOOKMARKS.map((bm) => (
            <button
              key={bm.name}
              type="button"
              onClick={() => openWebPreview(bm.url, bm.name)}
              className="apple-press flex flex-col items-center justify-center p-2.5 rounded-xl bg-white border border-black/[0.06] hover:border-black/[0.15] hover:shadow-xs transition-all group"
            >
              <div
                style={{ backgroundColor: `${bm.color}15`, color: bm.color }}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] mb-1 group-hover:scale-105 transition-transform"
              >
                {bm.icon}
              </div>
              <span className="text-[11px] font-medium text-[#1d1d1f] truncate max-w-full">
                {bm.name}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => createNewWebTab()}
          className="apple-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.05] hover:bg-black/[0.08] text-[12px] font-medium text-[#1d1d1f] transition-colors"
        >
          <Plus className="w-3.5 h-3.5 text-[#0071e3]" />
          <span>新建空白浏览标签页</span>
        </button>
      </div>
    )
  }

  // 2. ACTIVE MULTI-TAB WORKSPACE
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white animate-apple-view select-text">
      {/* 1. Multi-Tab Bar at the very top */}
      <div className="h-9 px-2 bg-[#F2F2F5] border-b border-black/[0.08] flex items-center justify-between gap-1 select-none shrink-0">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {previewTabs.map((tab) => {
            const isActive = tab.id === activePreview.id
            return (
              <div
                key={tab.id}
                onClick={() => setActivePreviewTab(tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] cursor-pointer transition-all shrink-0 max-w-[160px] min-w-[70px] border ${
                  isActive
                    ? 'bg-white text-[#1d1d1f] font-medium border-black/[0.08] shadow-2xs'
                    : 'bg-transparent text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.04] border-transparent'
                }`}
                title={tab.title || tab.fileName || '标签页'}
              >
                {getTabIcon(tab)}
                <span className="truncate flex-1">{tab.title || tab.fileName || '新标签页'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closePreviewTab(tab.id)
                  }}
                  title="关闭标签页"
                  className="p-0.5 rounded hover:bg-black/[0.1] text-[#86868b] hover:text-[#1d1d1f] opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}

          {/* New Tab Button */}
          <button
            type="button"
            onClick={() => createNewWebTab()}
            title="新建网页标签页"
            className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.06] shrink-0 ml-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right tools in Tab Bar */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            type="button"
            onClick={toggleInspectorExpanded}
            title={isInspectorExpanded ? '恢复默认宽度' : '拓宽侧边浏览区域'}
            className="apple-press p-1 rounded-md hover:bg-black/[0.06] text-[#6e6e73] hover:text-[#1d1d1f]"
          >
            {isInspectorExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          {previewTabs.length > 1 && (
            <button
              type="button"
              onClick={closeAllPreviewTabs}
              title="关闭全部标签页"
              className="apple-press px-1.5 py-0.5 text-[10.5px] rounded text-[#86868b] hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
            >
              全部关闭
            </button>
          )}
        </div>
      </div>

      {/* 2. Mini Browser Address Bar (when active tab is web) */}
      {activePreview.type === 'web' && (
        <div className="px-2.5 py-1.5 bg-[#F9F9FB] border-b border-black/[0.05] flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              try {
                activeWebview?.goBack()
              } catch {
                // ignore
              }
            }}
            title="后退"
            className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05]"
          >
            <ArrowLeft className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                activeWebview?.goForward()
              } catch {
                // ignore
              }
            }}
            title="前进"
            className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05]"
          >
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                activeWebview?.reload()
              } catch {
                // ignore
              }
            }}
            title="重新加载"
            className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05]"
          >
            <RotateCw className={`w-3 h-3 ${activeTabLoading ? 'animate-spin text-[#0071e3]' : ''}`} />
          </button>

          {/* URL Input Form */}
          <form onSubmit={handleNavigateWeb} className="flex-1 min-w-0 flex items-center">
            <div className="w-full flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/[0.04] focus-within:bg-white border border-transparent focus-within:border-[#0071e3] transition-all">
              <Globe className="w-3 h-3 text-[#86868b] shrink-0" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full bg-transparent text-[11px] font-mono text-[#1d1d1f] focus:outline-none truncate"
                placeholder="输入网页地址回车访问..."
              />
            </div>
          </form>

          <button
            type="button"
            onClick={() => handleCopyText(activePreview.url || urlInput)}
            title="复制当前网址链接"
            className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05] shrink-0"
          >
            {copiedText ? (
              <Check className="w-3 h-3 text-[#34C759]" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>

          {/* In Browser Selector Dropdown */}
          <div className="relative" ref={browserMenuRef}>
            <button
              type="button"
              onClick={() => setIsBrowserMenuOpen((prev) => !prev)}
              className="apple-press flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-black/[0.08] text-[#1d1d1f] hover:bg-black/[0.03] shadow-xs text-[11px] font-medium shrink-0"
              title="在电脑安装的浏览器中打开进一步操作"
            >
              <ExternalLink className="w-3 h-3 text-[#0071e3]" />
              <span className="hidden sm:inline">在浏览器中打开</span>
              <ChevronDown className="w-2.5 h-2.5 text-[#86868b]" />
            </button>

            {isBrowserMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-black/[0.09] py-1.5 z-50 animate-apple-menu">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">
                  选择启动浏览器
                </div>
                {installedBrowsers.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleLaunchInBrowser(b)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[11.5px] text-[#1d1d1f] hover:bg-[#F2F2F7] transition-colors"
                  >
                    {b.id === 'default' ? (
                      <Globe className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                    ) : b.name.includes('Chrome') ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-[#EA4335]/20 text-[#EA4335] text-[9px] font-bold flex items-center justify-center shrink-0">
                        G
                      </span>
                    ) : b.name.includes('Safari') ? (
                      <Compass className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                    )}
                    <span className="truncate flex-1 font-medium">{b.name}</span>
                    {b.isDefault && (
                      <span className="text-[10px] text-[#86868b] font-normal">默认</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Document Top Toolbar (when active tab is document) */}
      {activePreview.type !== 'web' && (
        <div className="px-2.5 py-1.5 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between gap-1.5 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 uppercase ${
                activePreview.type === 'pdf'
                  ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                  : activePreview.type === 'docx'
                    ? 'bg-[#0071e3]/12 text-[#0071e3]'
                    : activePreview.type === 'excel'
                      ? 'bg-[#34C759]/15 text-[#177233]'
                      : 'bg-[#5856D6]/12 text-[#5856D6]'
              }`}
            >
              {activePreview.type.toUpperCase()}
            </span>
            <span
              className="font-medium text-[#1d1d1f] truncate text-[11.5px]"
              title={activePreview.title || activePreview.fileName}
            >
              {activePreview.title || activePreview.fileName || '文档预览'}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activePreview.filePath && (
              <button
                type="button"
                onClick={handleOpenInSystemApp}
                className="apple-press flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-black/[0.08] text-[#0071e3] hover:bg-black/[0.03] shadow-xs text-[11px] font-medium"
                title="在系统默认应用中打开此文件"
              >
                <Eye className="w-3 h-3" />
                <span>在系统应用中打开</span>
              </button>
            )}

            {/* In Browser Selector Dropdown for documents */}
            <div className="relative" ref={browserMenuRef}>
              <button
                type="button"
                onClick={() => setIsBrowserMenuOpen((prev) => !prev)}
                className="apple-press flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-black/[0.08] text-[#1d1d1f] hover:bg-black/[0.03] shadow-xs text-[11px] font-medium"
                title="在电脑安装的浏览器中打开进一步操作"
              >
                <ExternalLink className="w-3 h-3 text-[#0071e3]" />
                <span className="hidden sm:inline">在浏览器中打开</span>
                <ChevronDown className="w-2.5 h-2.5 text-[#86868b]" />
              </button>

              {isBrowserMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-black/[0.09] py-1.5 z-50 animate-apple-menu">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-[#86868b] uppercase tracking-wider">
                    选择启动浏览器
                  </div>
                  {installedBrowsers.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleLaunchInBrowser(b)}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[11.5px] text-[#1d1d1f] hover:bg-[#F2F2F7] transition-colors"
                    >
                      {b.id === 'default' ? (
                        <Globe className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                      ) : b.name.includes('Chrome') ? (
                        <span className="w-3.5 h-3.5 rounded-full bg-[#EA4335]/20 text-[#EA4335] text-[9px] font-bold flex items-center justify-center shrink-0">
                          G
                        </span>
                      ) : b.name.includes('Safari') ? (
                        <Compass className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                      )}
                      <span className="truncate flex-1 font-medium">{b.name}</span>
                      {b.isDefault && (
                        <span className="text-[10px] text-[#86868b] font-normal">默认</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Concurrently Mounted Web Tabs (keep state/video/forms alive across tab switching) */}
      <div
        className={`flex-1 w-full h-full relative overflow-hidden bg-white ${
          activePreview.type === 'web' ? 'flex flex-col' : 'hidden'
        }`}
      >
        {previewTabs
          .filter((tab) => tab.type === 'web')
          .map((tab) => (
            <WebviewTabItem
              key={tab.id}
              tab={tab}
              isActive={activePreview.id === tab.id}
              isResizing={isInspectorResizing}
              onUpdateTab={(partial) => updatePreviewTab(tab.id, partial)}
              onRegisterWebview={(wv) => {
                webviewInstancesRef.current.set(tab.id, wv)
              }}
              onUnregisterWebview={() => {
                webviewInstancesRef.current.delete(tab.id)
              }}
              onOpenInExternalBrowser={(url) => {
                const targetBrowser =
                  installedBrowsers.find((b) => !b.isDefault) || installedBrowsers[0]
                handleLaunchInBrowser(targetBrowser, url)
              }}
              onLoadingChange={(loading) => {
                if (activePreview.id === tab.id) {
                  setActiveTabLoading(loading)
                }
              }}
            />
          ))}
      </div>

      {/* SUB-VIEW 2: PDF DOCUMENT VIEW */}
      {activePreview.type === 'pdf' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F5F5F7]">
          {/* Sub Toolbar: Switch between Visual Embed vs Extracted Page Text */}
          <div className="px-3 py-1.5 bg-[#F2F2F7] border-b border-black/[0.05] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-black/[0.05]">
              <button
                type="button"
                onClick={() => setPdfViewMode('embed')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                  pdfViewMode === 'embed'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                页面排版原貌
              </button>
              <button
                type="button"
                onClick={() => setPdfViewMode('text')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                  pdfViewMode === 'text'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                文本与章节结构
              </button>
            </div>

            <span className="text-[10.5px] font-mono text-[#86868b] truncate max-w-[140px]">
              {activePreview.meta || 'PDF 文档'}
            </span>
          </div>

          <div className="flex-1 overflow-hidden relative bg-white">
            {pdfViewMode === 'embed' ? (
              activePreview.filePath ? (
                <webview
                  src={`file://${activePreview.filePath}`}
                  className="w-full h-full border-0"
                  style={{
                    width: '100%',
                    height: '100%',
                    pointerEvents: isInspectorResizing ? 'none' : 'auto'
                  }}
                />
              ) : activePreview.dataUrl ? (
                <webview
                  src={activePreview.dataUrl}
                  className="w-full h-full border-0"
                  style={{
                    width: '100%',
                    height: '100%',
                    pointerEvents: isInspectorResizing ? 'none' : 'auto'
                  }}
                />
              ) : (
                <div className="p-4 overflow-auto h-full font-mono text-[11.5px] text-[#1d1d1f] leading-relaxed whitespace-pre-wrap">
                  {activePreview.rawText || '暂无可供直接原貌渲染的本地文件路径'}
                </div>
              )
            ) : (
              <div className="p-4 overflow-y-auto h-full font-sans text-[12px] text-[#1d1d1f] leading-relaxed space-y-3">
                {activePreview.rawText ? (
                  activePreview.rawText.split('\n\n').map((paragraph, idx) => (
                    <p
                      key={idx}
                      className={
                        paragraph.startsWith('---')
                          ? 'font-bold text-[#0071e3] font-mono py-1 border-b border-black/[0.06]'
                          : 'text-[#2c2c2e]'
                      }
                    >
                      {paragraph}
                    </p>
                  ))
                ) : (
                  <div className="text-[#86868b] text-center pt-8">未能从文档提取到文本层</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: EXCEL / SPREADSHEET TABLE VIEW */}
      {activePreview.type === 'excel' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Table Search & Meta Header */}
          <div className="px-3 py-1.5 bg-[#F9F9FB] border-b border-black/[0.05] flex items-center justify-between gap-2 text-[11px]">
            <div className="relative flex-1 max-w-[200px]">
              <Search className="w-3 h-3 text-[#86868b] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={excelSearchQuery}
                onChange={(e) => setExcelSearchQuery(e.target.value)}
                placeholder="筛选表格行数据..."
                className="w-full pl-6 pr-2 py-0.5 rounded-lg bg-black/[0.04] focus:bg-white border border-transparent focus:border-[#0071e3] text-[11px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 text-[#86868b] text-[10.5px] font-mono">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#34C759]" />
              <span>
                {activePreview.excelData?.sheets[activeSheetIndex]?.rows.length || 0} 行
              </span>
            </div>
          </div>

          {/* Interactive Multi-Sheet Grid */}
          <div className="flex-1 overflow-auto bg-white">
            {activePreview.excelData && activePreview.excelData.sheets.length > 0 ? (
              (() => {
                const sheet =
                  activePreview.excelData.sheets[activeSheetIndex] ||
                  activePreview.excelData.sheets[0]
                const query = excelSearchQuery.trim().toLowerCase()
                const filteredRows = query
                  ? sheet.rows.filter((row, idx) =>
                      idx === 0 ? true : row.some((cell) => cell.toLowerCase().includes(query))
                    )
                  : sheet.rows

                if (filteredRows.length === 0) {
                  return (
                    <div className="h-full flex items-center justify-center text-[#86868b] text-[12px]">
                      未匹配到包含 “{excelSearchQuery}” 的行数据
                    </div>
                  )
                }

                const headerRow = filteredRows[0] || []
                const bodyRows = filteredRows.slice(1)

                return (
                  <table className="w-full text-left border-collapse text-[11px] font-mono">
                    <thead className="sticky top-0 bg-[#F5F5F7] z-10 border-b border-black/[0.1] shadow-2xs">
                      <tr>
                        <th className="w-9 px-2 py-1.5 text-center text-[10px] text-[#86868b] border-r border-black/[0.06] select-none bg-[#EFEFF4]">
                          #
                        </th>
                        {headerRow.map((col, cIdx) => (
                          <th
                            key={cIdx}
                            className="px-3 py-1.5 font-bold text-[#1d1d1f] border-r border-black/[0.06] last:border-r-0 whitespace-nowrap bg-[#F5F5F7]"
                          >
                            {col || `Col ${cIdx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {bodyRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-[#F2F7FF] transition-colors odd:bg-white even:bg-[#FAFAFC]"
                        >
                          <td className="w-9 px-2 py-1 text-center text-[10px] text-[#aeaeb2] border-r border-black/[0.05] select-none font-mono bg-black/[0.015]">
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3 py-1 text-[#2c2c2e] border-r border-black/[0.04] last:border-r-0 whitespace-nowrap"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()
            ) : (
              <div className="p-4 font-mono text-[11.5px] whitespace-pre-wrap leading-relaxed text-[#1d1d1f]">
                {activePreview.rawText || '表格解析中或数据为空'}
              </div>
            )}
          </div>

          {/* Bottom Sheet Switcher Tabs */}
          {activePreview.excelData && activePreview.excelData.sheets.length > 1 && (
            <div className="px-2 py-1 bg-[#F5F5F7] border-t border-black/[0.06] flex items-center gap-1 overflow-x-auto">
              {activePreview.excelData.sheets.map((s, idx) => (
                <button
                  key={s.name || idx}
                  type="button"
                  onClick={() => setActiveSheetIndex(idx)}
                  className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium shrink-0 transition-colors ${
                    activeSheetIndex === idx
                      ? 'bg-white text-[#177233] shadow-xs font-semibold'
                      : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                  }`}
                >
                  {s.name || `Sheet${idx + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 4: WORD / DOCX VIEW */}
      {activePreview.type === 'docx' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-3 py-1.5 bg-[#F5F5F7] border-b border-black/[0.05] flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-black/[0.05]">
              <button
                type="button"
                onClick={() => setDocxViewMode('html')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                  docxViewMode === 'html'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                排版视图
              </button>
              <button
                type="button"
                onClick={() => setDocxViewMode('text')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium transition-colors ${
                  docxViewMode === 'text'
                    ? 'bg-white text-[#1d1d1f] shadow-xs'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                纯文本
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                stageContentForDocEditor(activePreview.rawText || '')
                setWorkbenchSubView('chat')
              }}
              title="将文档内容复制到排版编辑器精修"
              className="apple-press text-[#5856D6] hover:text-[#4341aa] font-medium text-[11px]"
            >
              发送至精修排版区
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 leading-relaxed font-sans text-[12.5px] text-[#1d1d1f]">
            {docxViewMode === 'html' && activePreview.htmlContent ? (
              <div
                className="docx-styled-html space-y-2.5 max-w-full"
                dangerouslySetInnerHTML={{ __html: activePreview.htmlContent }}
              />
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed text-[#2c2c2e]">
                {activePreview.rawText || '文档解析中或内容为空'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: IMAGE VIEW */}
      {activePreview.type === 'image' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F2F2F7]">
          {/* Zoom & Fit Toolbar */}
          <div className="px-3 py-1 bg-white border-b border-black/[0.06] flex items-center justify-between text-[11px]">
            <span className="font-mono text-[10.5px] text-[#86868b]">
              {activePreview.meta || '图像'}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(0.4, z - 0.2))}
                className="apple-press p-1 rounded-md hover:bg-black/[0.05] text-[#6e6e73]"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-[10.5px] text-[#1d1d1f]">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(3, z + 0.2))}
                className="apple-press p-1 rounded-md hover:bg-black/[0.05] text-[#6e6e73]"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setImageZoom(1)}
                className="apple-press px-1.5 py-0.5 rounded text-[10px] font-mono text-[#0071e3] hover:bg-[#0071e3]/10"
              >
                1:1
              </button>
            </div>
          </div>

          {/* Image Canvas with Checkerboard Background for PNG Transparency */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#EBEBF0]">
            <img
              src={
                activePreview.dataUrl ||
                (activePreview.filePath ? `file://${activePreview.filePath}` : '')
              }
              alt={activePreview.title}
              style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center center' }}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md transition-transform duration-150"
            />
          </div>

          {/* Neural OCR Text Drawer (if text was recognized) */}
          {activePreview.rawText && (
            <div className="max-h-36 overflow-y-auto p-2.5 bg-white border-t border-black/[0.06] text-[11px] font-mono text-[#48484a]">
              <div className="text-[10px] font-bold text-[#86868b] uppercase mb-1">
                已识别图像中的文字 (Apple Neural OCR)
              </div>
              <div className="whitespace-pre-wrap leading-relaxed select-text">
                {activePreview.rawText}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 6: PLAIN TEXT / CODE VIEW */}
      {activePreview.type === 'text' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="px-3 py-1.5 bg-[#F5F5F7] border-b border-black/[0.05] flex items-center justify-between text-[11px]">
            <span className="font-mono text-[#86868b] text-[10.5px]">
              {activePreview.meta || '文本内容'}
            </span>
            <button
              type="button"
              onClick={() => handleCopyText(activePreview.rawText || '')}
              className="apple-press inline-flex items-center gap-1 text-[#0071e3] font-medium"
            >
              {copiedText ? (
                <Check className="w-3 h-3 text-[#34C759]" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copiedText ? '已复制' : '复制全文'}</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-3.5 font-mono text-[11px] leading-[1.65] text-[#1d1d1f] whitespace-pre-wrap">
            {activePreview.rawText || '(文件内容为空)'}
          </div>
        </div>
      )}
    </div>
  )
}
