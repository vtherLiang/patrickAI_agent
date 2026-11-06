export function isKnowledgeBaseCompatibleAttachment(att?: {
  name?: string
  ext?: string
  kind?: string
} | null): boolean {
  if (!att) return false
  const name = (att.name || '').toLowerCase()
  const rawExt = (att.ext || '').toLowerCase().replace(/^\./, '')
  const fileExt = name.includes('.') ? name.split('.').pop() || '' : rawExt

  const SUPPORTED_EXTS = new Set([
    'tex',
    'png',
    'jpg',
    'jpeg',
    'jpj',
    'webp',
    'gif',
    'bmp',
    'svg',
    'doc',
    'docx',
    'pdf'
  ])

  if (SUPPORTED_EXTS.has(fileExt) || SUPPORTED_EXTS.has(rawExt)) return true
  if (att.kind === 'image' || att.kind === 'docx' || att.kind === 'pdf') return true
  return false
}
