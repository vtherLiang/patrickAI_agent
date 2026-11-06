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
  Compass
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { InstalledBrowserInfo } from '@shared/types'

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const CodexBrowserPreview: React.FC = () => {
  const {
    activePreview,
    openWebPreview,
    closePreview,
    stageContentForDocEditor,
    setWorkbenchSubView,
    inspectorWidth,
    isInspectorExpanded,
    toggleInspectorExpanded,
    isInspectorResizing
  } = useAppStore()

  // Installed Browsers on User Machine
  const [installedBrowsers, setInstalledBrowsers] = useState<InstalledBrowserInfo[]>([
    { id: 'default', name: '系统默认浏览器', isDefault: true, available: true }
  ])
  const [isBrowserMenuOpen, setIsBrowserMenuOpen] = useState(false)
  const browserMenuRef = useRef<HTMLDivElement>(null)

  // Web Browser State
  const [currentUrl, setCurrentUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [isWebLoading, setIsWebLoading] = useState(false)
  const [webLoadError, setWebLoadError] = useState<string | null>(null)
  const webviewRef = useRef<any>(null)

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

  // Sync activePreview changes
  useEffect(() => {
    if (activePreview?.type === 'web' && activePreview.url) {
      setCurrentUrl(activePreview.url)
      setUrlInput(activePreview.url)
      setWebLoadError(null)
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
  }, [activePreview])

  // Wire Webview Events
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleStartLoading = () => {
      setIsWebLoading(true)
      setWebLoadError(null)
    }
    const handleStopLoading = () => {
      setIsWebLoading(false)
      try {
        const url = webview.getURL()
        if (url && url !== currentUrl) {
          setCurrentUrl(url)
          setUrlInput(url)
        }
      } catch {
        // ignore
      }
    }
    const handleFailLoad = (e: any) => {
      // Only process failure for the primary document frame (ignore sub-resources, beacons, ad blocks)
      if (e.isMainFrame === false) return

      setIsWebLoading(false)
      // -3 is ERR_ABORTED (navigation cancelled, e.g. redirect in progress or user typed new url)
      if (e.errorCode === -3) {
        return
      }

      // If connection closed or reset on an apex domain (e.g. baidu.com), automatically retry with www.
      const failedUrl = e.validatedURL || currentUrl
      try {
        const u = new URL(failedUrl)
        if (!u.hostname.startsWith('www.') && u.hostname.split('.').length === 2) {
          const autoWww = `${u.protocol}//www.${u.hostname}${u.pathname}${u.search}${u.hash}`
          if (autoWww !== currentUrl) {
            console.log(`[BrowserPreview] Auto-retrying with www: ${autoWww}`)
            setCurrentUrl(autoWww)
            setUrlInput(autoWww)
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
      webview.addEventListener('did-fail-load', handleFailLoad)
    } catch {
      // ignore
    }

    return () => {
      try {
        webview.removeEventListener('did-start-loading', handleStartLoading)
        webview.removeEventListener('did-stop-loading', handleStopLoading)
        webview.removeEventListener('did-fail-load', handleFailLoad)
      } catch {
        // ignore
      }
    }
  }, [currentUrl, activePreview?.type])

  const handleLaunchInBrowser = async (browser: InstalledBrowserInfo) => {
    setIsBrowserMenuOpen(false)
    let targetUrl = currentUrl
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
    setCurrentUrl(raw)
    setUrlInput(raw)
    setWebLoadError(null)
  }

  const handleCopyText = (content: string) => {
    navigator.clipboard?.writeText(content)
    setCopiedText(true)
    setTimeout(() => setCopiedText(false), 1800)
  }

  // 1. EMPTY / WELCOME STATE
  if (!activePreview) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#FBFBFD] overflow-y-auto">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0071e3]/10 to-[#5856D6]/10 border border-black/[0.06] flex items-center justify-center text-[#0071e3] mb-4 shadow-sm">
          <Compass className="w-7 h-7" />
        </div>

        <h3 className="text-[14.5px] font-semibold text-[#1d1d1f] mb-1.5">
          实时侧边浏览工作台
        </h3>
        <p className="text-[12px] text-[#6e6e73] leading-relaxed max-w-[280px] mb-5">
          在对话框上传或提及的 PDF、Word、Excel 表格、图片，以及对话中的网站链接，点击后即可在此实时交互浏览。
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
          className="w-full max-w-[300px] flex items-center gap-1.5 p-1 rounded-xl bg-white border border-black/[0.08] shadow-sm mb-3 focus-within:border-[#0071e3]"
        >
          <Globe className="w-3.5 h-3.5 text-[#86868b] shrink-0 ml-1.5" />
          <input
            type="text"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="输入网址直接浏览 (如 github.com)..."
            className="flex-1 bg-transparent text-[11.5px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!customUrlInput.trim()}
            className="apple-press px-2 py-1 rounded-lg bg-[#0071e3] text-white text-[11px] font-medium disabled:opacity-40 shrink-0"
          >
            浏览
          </button>
        </form>

        <div className="flex items-center gap-2 text-[11px] text-[#86868b]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#34C759]" />
          <span>支持多浏览器分流调起与原生文档解析</span>
        </div>
      </div>
    )
  }

  // 2. ACTIVE PREVIEW RENDERER
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white animate-apple-view select-text">
      {/* Universal Top Header Toolbar */}
      <div className="px-2.5 py-1.5 bg-[#F5F5F7] border-b border-black/[0.06] flex items-center justify-between gap-1.5 text-[11px]">
        {/* Left: Type Pill & Title */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 uppercase ${
              activePreview.type === 'web'
                ? 'bg-[#0071e3]/12 text-[#0071e3]'
                : activePreview.type === 'pdf'
                  ? 'bg-[#FF3B30]/12 text-[#C41E16]'
                  : activePreview.type === 'docx'
                    ? 'bg-[#0071e3]/12 text-[#0071e3]'
                    : activePreview.type === 'excel'
                      ? 'bg-[#34C759]/15 text-[#177233]'
                      : 'bg-[#5856D6]/12 text-[#5856D6]'
            }`}
          >
            {activePreview.type === 'web' ? 'WEB' : activePreview.type.toUpperCase()}
          </span>

          <span
            className="font-medium text-[#1d1d1f] truncate text-[11.5px]"
            title={activePreview.title || activePreview.fileName}
          >
            {activePreview.title || activePreview.fileName || '浏览'}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle Width Expand Button */}
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

          {/* Open In Browser Dropdown Selector (Required Feature!) */}
          <div className="relative" ref={browserMenuRef}>
            <button
              type="button"
              onClick={() => setIsBrowserMenuOpen((prev) => !prev)}
              className="apple-press flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-black/[0.08] text-[#1d1d1f] hover:bg-black/[0.03] shadow-xs text-[11px] font-medium"
              title="在电脑安装的浏览器中打开进一步操作"
            >
              <ExternalLink className="w-3 h-3 text-[#0071e3]" />
              <span className="hidden sm:inline">在浏览器中打开</span>
              <span className="sm:hidden">打开</span>
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

                {activePreview.filePath && (
                  <>
                    <div className="my-1 border-t border-black/[0.06]" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsBrowserMenuOpen(false)
                        handleOpenInSystemApp()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-[#0071e3] hover:bg-[#F2F2F7] font-medium"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>在系统原生应用中打开</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUB-VIEW 1: WEB BROWSER VIEW */}
      {activePreview.type === 'web' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#FBFBFD]">
          {/* Mini Browser Address Bar */}
          <div className="px-2.5 py-1.5 bg-[#F9F9FB] border-b border-black/[0.05] flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                try {
                  webviewRef.current?.goBack()
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
                  webviewRef.current?.goForward()
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
                  webviewRef.current?.reload()
                } catch {
                  // ignore
                }
              }}
              title="重新加载"
              className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05]"
            >
              <RotateCw className={`w-3 h-3 ${isWebLoading ? 'animate-spin text-[#0071e3]' : ''}`} />
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
              onClick={() => handleCopyText(currentUrl)}
              title="复制当前网址链接"
              className="apple-press p-1 rounded-md text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05] shrink-0"
            >
              {copiedText ? (
                <Check className="w-3 h-3 text-[#34C759]" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Loading Indicator Stripe */}
          {isWebLoading && (
            <div className="h-0.5 w-full bg-[#0071e3]/20 overflow-hidden">
              <div className="h-full bg-[#0071e3] animate-pulse w-2/3" />
            </div>
          )}

          {/* Error Banner with helpful diagnostics and actions */}
          {webLoadError && (
            <div className="p-2.5 bg-[#FF9500]/10 border-b border-[#FF9500]/20 flex items-center justify-between text-[11px] text-[#C96A00] gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold shrink-0">访问提示:</span>
                <span className="truncate">
                  {webLoadError.includes('ERR_CONNECTION_CLOSED')
                    ? '远程服务器关闭了连接 (国内部分网站如 baidu.com 必须使用 www.baidu.com 访问)'
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
                        setUrlInput(wwwUrl)
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
                  onClick={() =>
                    handleLaunchInBrowser(
                      installedBrowsers.find((b) => !b.isDefault) || installedBrowsers[0]
                    )
                  }
                  className="apple-press font-semibold underline text-[#0071e3]"
                >
                  在外部浏览器中浏览
                </button>
              </div>
            </div>
          )}

          {/* Live Guest Webview Element */}
          <div className="flex-1 w-full h-full relative overflow-hidden bg-white">
            {currentUrl ? (
              <webview
                ref={webviewRef}
                src={currentUrl}
                className="w-full h-full border-0"
                allowpopups={true}
                useragent={DESKTOP_CHROME_UA}
                style={{
                  width: '100%',
                  height: '100%',
                  pointerEvents: isInspectorResizing ? 'none' : 'auto'
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[#86868b] text-[12px]">
                请输入网址开始浏览
              </div>
            )}
          </div>
        </div>
      )}

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
