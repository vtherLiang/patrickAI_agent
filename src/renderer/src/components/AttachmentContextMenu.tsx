import React, { useEffect, useRef } from 'react'
import { BookPlus, ExternalLink } from 'lucide-react'
import { ChatAttachment } from '@shared/types'

export interface AttachmentContextMenuProps {
  x: number
  y: number
  attachment: ChatAttachment
  onClose: () => void
  onAddToKnowledgeBase: (att: ChatAttachment) => void
  onPreview?: (att: ChatAttachment) => void
}

export const AttachmentContextMenu: React.FC<AttachmentContextMenuProps> = ({
  x,
  y,
  attachment,
  onClose,
  onAddToKnowledgeBase,
  onPreview
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[190px] bg-white/95 backdrop-blur-2xl border border-black/[0.1] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] p-1.5 animate-apple-menu select-none text-[12.5px]"
    >
      <div className="px-2.5 py-1.5 border-b border-black/[0.05] mb-1">
        <div className="text-[11.5px] font-semibold text-[#1d1d1f] truncate max-w-[200px]" title={attachment.name}>
          {attachment.name}
        </div>
        <div className="text-[10px] font-mono text-[#86868b] uppercase">
          {attachment.ext || 'FILE'} 文档
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onClose()
          onAddToKnowledgeBase(attachment)
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[#1d1d1f] hover:bg-[#5856D6] hover:text-white transition-colors cursor-pointer group"
      >
        <BookPlus className="w-3.5 h-3.5 text-[#5856D6] group-hover:text-white transition-colors" />
        <span className="font-medium">加入知识库</span>
      </button>

      {onPreview && (
        <button
          type="button"
          onClick={() => {
            onClose()
            onPreview(attachment)
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[#48484a] hover:bg-black/[0.05] transition-colors cursor-pointer mt-0.5"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#86868b]" />
          <span>在侧边交互预览</span>
        </button>
      )}
    </div>
  )
}
