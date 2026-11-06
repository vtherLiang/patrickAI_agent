import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  DocPresetType,
  ImportKnowledgeDocPayload,
  KnowledgeBaseState,
  KnowledgeDocItem,
  KnowledgeDocKind,
  NaturalizeLevel,
  ReadKnowledgeDocResult,
  SaveKnowledgePdfPayload,
  StreamUpdatePayload
} from '@shared/types'
import { DocumentExporter, sanitizeDocFileName } from './DocumentExporter'
import { AttachmentParser } from './AttachmentParser'

export const KNOWLEDGE_FOLDER_NAME = '知识库文档存储'
const INDEX_FILE_NAME = '.kb-index.json'

export const KB_SUPPORTED_EXTS = new Set([
  '.pdf',
  '.tex',
  '.png',
  '.jpg',
  '.jpeg',
  '.jpj',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.doc',
  '.docx'
])

export function getDocKindFromExt(ext: string): KnowledgeDocKind {
  const lower = ext.toLowerCase()
  if (lower === '.pdf') return 'pdf'
  if (lower === '.tex') return 'tex'
  if (['.png', '.jpg', '.jpeg', '.jpj', '.webp', '.gif', '.bmp', '.svg'].includes(lower)) return 'image'
  if (['.doc', '.docx'].includes(lower)) return 'word'
  return 'other'
}

interface StoredDocMeta {
  id: string
  title: string
  fileName: string
  kind?: KnowledgeDocKind
  preset?: DocPresetType
  naturalizeLevel?: NaturalizeLevel
  charCount?: number
  summarySnippet?: string
  createdAt: number
}

export function resolveDefaultAppSupportBase(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude Code Studio')
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'Claude Code Studio')
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(xdgConfig, 'Claude Code Studio')
}

export class KnowledgeBaseManager {
  private storageDir: string
  private indexPath: string
  private broadcast: (payload: StreamUpdatePayload) => void

  constructor(
    preferredBaseDir: string,
    fallbackAppDir: string,
    broadcast: (payload: StreamUpdatePayload) => void
  ) {
    this.broadcast = broadcast
    const candidateDir = path.join(preferredBaseDir, KNOWLEDGE_FOLDER_NAME)
    let resolvedDir = candidateDir

    try {
      fs.mkdirSync(candidateDir, { recursive: true })
    } catch {
      resolvedDir = path.join(fallbackAppDir, KNOWLEDGE_FOLDER_NAME)
      fs.mkdirSync(resolvedDir, { recursive: true })
    }

    this.storageDir = resolvedDir
    this.indexPath = path.join(this.storageDir, INDEX_FILE_NAME)
  }

  public ensureStorageDir(): string {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }
    return this.storageDir
  }

  private loadMetaMap(): Map<string, StoredDocMeta> {
    this.ensureStorageDir()
    const map = new Map<string, StoredDocMeta>()
    if (!fs.existsSync(this.indexPath)) return map

    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'))
      if (Array.isArray(parsed)) {
        for (const item of parsed as StoredDocMeta[]) {
          if (item && item.fileName) {
            map.set(item.fileName, item)
          }
        }
      }
    } catch {
      // ignore corrupted index
    }
    return map
  }

  private saveMetaMap(map: Map<string, StoredDocMeta>): void {
    this.ensureStorageDir()
    try {
      const arr = Array.from(map.values())
      fs.writeFileSync(this.indexPath, JSON.stringify(arr, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to write knowledge base index:', err)
    }
  }

  public getState(): KnowledgeBaseState {
    this.ensureStorageDir()
    const metaMap = this.loadMetaMap()
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(this.storageDir, { withFileTypes: true })
    } catch {
      entries = []
    }

    const matchedFiles = entries.filter(
      (e) =>
        e.isFile() &&
        !e.name.startsWith('.') &&
        KB_SUPPORTED_EXTS.has(path.extname(e.name).toLowerCase())
    )

    const activeFileNames = new Set<string>()
    const docs: KnowledgeDocItem[] = []
    let metaDirty = false

    for (const file of matchedFiles) {
      activeFileNames.add(file.name)
      const fullPath = path.join(this.storageDir, file.name)
      let stat: fs.Stats
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }

      const ext = path.extname(file.name).toLowerCase()
      const kind = getDocKindFromExt(ext)

      let meta = metaMap.get(file.name)
      if (!meta) {
        let snippet: string | undefined
        let charCount: number | undefined = stat.size

        if (kind === 'tex') {
          try {
            const buf = fs.readFileSync(fullPath, 'utf-8')
            charCount = buf.length
            snippet = buf
              .replace(/%.*$/gm, '')
              .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
              .replace(/\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/g, '$1')
              .replace(/\\[a-zA-Z]+/g, ' ')
              .replace(/[$_{}&#%~^\\]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 120)
          } catch {
            // ignore
          }
        } else if (kind === 'word') {
          try {
            const parsed = AttachmentParser.parseFile(fullPath)
            if (parsed?.extractedText) {
              charCount = parsed.extractedText.length
              snippet = parsed.extractedText
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 120)
            }
          } catch {
            // ignore
          }
        } else if (kind === 'image') {
          const rawExt = ext.replace('.', '').toUpperCase()
          snippet = `图像文件 · ${rawExt}`
          charCount = undefined
        }

        meta = {
          id: `kb_${Math.round(stat.birthtimeMs || stat.mtimeMs)}_${Buffer.from(file.name).toString('base64url').slice(0, 8)}`,
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          kind,
          charCount,
          summarySnippet: snippet,
          createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs)
        }
        metaMap.set(file.name, meta)
        metaDirty = true
      }

      docs.push({
        id: meta.id,
        title: meta.title,
        fileName: file.name,
        filePath: fullPath,
        sizeBytes: stat.size,
        kind: meta.kind || kind,
        preset: meta.preset,
        naturalizeLevel: meta.naturalizeLevel,
        charCount: meta.charCount,
        summarySnippet: meta.summarySnippet,
        createdAt: meta.createdAt || Math.round(stat.mtimeMs)
      })
    }

    // Prune metadata entries whose file was removed externally
    for (const key of Array.from(metaMap.keys())) {
      if (!activeFileNames.has(key)) {
        metaMap.delete(key)
        metaDirty = true
      }
    }

    if (metaDirty) {
      this.saveMetaMap(metaMap)
    }

    docs.sort((a, b) => b.createdAt - a.createdAt)
    return {
      storageDir: this.storageDir,
      docs
    }
  }

  public async savePdfDocument(
    payload: SaveKnowledgePdfPayload,
    BrowserWindowCtor?: typeof import('electron').BrowserWindow
  ): Promise<{ item: KnowledgeDocItem; state: KnowledgeBaseState }> {
    this.ensureStorageDir()
    const pdfBuffer = await DocumentExporter.generatePdfBuffer(payload, BrowserWindowCtor)

    const baseTitle = sanitizeDocFileName(payload.title, '排版归档文档')
    let fileName = `${baseTitle}.pdf`
    let counter = 2
    while (fs.existsSync(path.join(this.storageDir, fileName))) {
      fileName = `${baseTitle} (${counter}).pdf`
      counter++
    }

    const fullPath = path.join(this.storageDir, fileName)
    fs.writeFileSync(fullPath, pdfBuffer)

    const snippet = (payload.markdown || '')
      .replace(/^#+\s+.+$/gm, '')
      .replace(/[`*|>~_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)

    const now = Date.now()
    const meta: StoredDocMeta = {
      id: `kb_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: fileName.replace(/\.pdf$/i, ''),
      fileName,
      kind: 'pdf',
      preset: payload.preset,
      naturalizeLevel: payload.naturalizeLevel,
      charCount: (payload.markdown || '').length,
      summarySnippet: snippet || undefined,
      createdAt: now
    }

    const metaMap = this.loadMetaMap()
    metaMap.set(fileName, meta)
    this.saveMetaMap(metaMap)

    const state = this.getState()
    const savedItem =
      state.docs.find((d) => d.id === meta.id) || {
        ...meta,
        filePath: fullPath,
        sizeBytes: pdfBuffer.length
      }

    this.broadcast({
      type: 'knowledge_docs_updated',
      knowledgeDocs: state.docs
    })

    return { item: savedItem, state }
  }

  public async importAttachment(
    payload: ImportKnowledgeDocPayload
  ): Promise<{ item: KnowledgeDocItem; state: KnowledgeBaseState }> {
    this.ensureStorageDir()

    let ext = (
      path.extname(payload.name) ||
      (payload.ext ? (payload.ext.startsWith('.') ? payload.ext : `.${payload.ext}`) : '')
    ).toLowerCase()

    if (!ext) {
      if (payload.kind === 'image') ext = '.png'
      else if (payload.kind === 'docx') ext = '.docx'
      else if (payload.kind === 'pdf') ext = '.pdf'
      else if (payload.kind === 'text') ext = '.tex'
      else ext = '.txt'
    }

    const rawName = payload.name.endsWith(ext)
      ? payload.name.slice(0, -ext.length)
      : payload.name
    const baseTitle = sanitizeDocFileName(rawName, '知识库文档')

    let fileName = `${baseTitle}${ext}`
    let counter = 2
    while (fs.existsSync(path.join(this.storageDir, fileName))) {
      fileName = `${baseTitle} (${counter})${ext}`
      counter++
    }

    const destPath = path.join(this.storageDir, fileName)

    if (payload.filePath && fs.existsSync(payload.filePath)) {
      fs.copyFileSync(payload.filePath, destPath)
    } else if (payload.previewDataUrl) {
      const b64 = payload.previewDataUrl.includes(',')
        ? payload.previewDataUrl.split(',')[1]
        : payload.previewDataUrl
      fs.writeFileSync(destPath, Buffer.from(b64, 'base64'))
    } else if (payload.dataBase64) {
      fs.writeFileSync(destPath, Buffer.from(payload.dataBase64, 'base64'))
    } else if (payload.extractedText) {
      fs.writeFileSync(destPath, payload.extractedText, 'utf-8')
    } else {
      throw new Error(`无法获取文件「${payload.name}」的实体数据`)
    }

    const stat = fs.statSync(destPath)
    const kind = getDocKindFromExt(ext)
    let snippet: string | undefined
    let charCount: number | undefined = stat.size

    if (kind === 'tex') {
      try {
        const text = fs.readFileSync(destPath, 'utf-8')
        charCount = text.length
        snippet = text
          .replace(/%.*$/gm, '')
          .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
          .replace(/\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/g, '$1')
          .replace(/\\[a-zA-Z]+/g, ' ')
          .replace(/[$_{}&#%~^\\]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120)
      } catch {
        // ignore
      }
    } else if (kind === 'word') {
      try {
        const parsed = AttachmentParser.parseFile(destPath)
        if (parsed?.extractedText) {
          charCount = parsed.extractedText.length
          snippet = parsed.extractedText
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120)
        }
      } catch {
        // ignore
      }
    } else if (kind === 'image') {
      const rawExt = ext.replace('.', '').toUpperCase()
      snippet = `图像文件 · ${rawExt}`
      charCount = undefined
    }

    const now = Date.now()
    const meta: StoredDocMeta = {
      id: `kb_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: baseTitle,
      fileName,
      kind,
      charCount,
      summarySnippet: snippet,
      createdAt: now
    }

    const metaMap = this.loadMetaMap()
    metaMap.set(fileName, meta)
    this.saveMetaMap(metaMap)

    const state = this.getState()
    const savedItem =
      state.docs.find((d) => d.id === meta.id) || {
        ...meta,
        filePath: destPath,
        sizeBytes: stat.size
      }

    this.broadcast({
      type: 'knowledge_docs_updated',
      knowledgeDocs: state.docs
    })

    return { item: savedItem, state }
  }

  public getDocById(docId: string): KnowledgeDocItem | null {
    const { docs } = this.getState()
    return docs.find((d) => d.id === docId || d.fileName === docId) || null
  }

  public readDocBase64(docId: string): ReadKnowledgeDocResult | null {
    const doc = this.getDocById(docId)
    if (!doc) return null

    const resolved = path.resolve(doc.filePath)
    const rootResolved = path.resolve(this.storageDir)
    if (!resolved.startsWith(rootResolved + path.sep) || !fs.existsSync(resolved)) {
      return null
    }

    const ext = path.extname(doc.fileName).toLowerCase()
    const kind = doc.kind || getDocKindFromExt(ext)
    const buf = fs.readFileSync(resolved)
    const base64 = buf.toString('base64')

    let mimeType = 'application/octet-stream'
    let text: string | undefined
    let html: string | undefined

    if (kind === 'pdf') {
      mimeType = 'application/pdf'
    } else if (kind === 'tex') {
      mimeType = 'text/x-tex'
      text = buf.toString('utf-8')
    } else if (kind === 'image') {
      switch (ext) {
        case '.png':
          mimeType = 'image/png'
          break
        case '.svg':
          mimeType = 'image/svg+xml'
          break
        case '.webp':
          mimeType = 'image/webp'
          break
        case '.gif':
          mimeType = 'image/gif'
          break
        default:
          mimeType = 'image/jpeg'
          break
      }
    } else if (kind === 'word') {
      mimeType =
        ext === '.docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/msword'
      try {
        html = AttachmentParser.convertDocxToHtml(resolved)
      } catch {
        html = undefined
      }
      if (!html) {
        try {
          const parsed = AttachmentParser.parseFile(resolved)
          text = parsed?.extractedText || ''
        } catch {
          text = ''
        }
      }
    }

    return {
      base64,
      fileName: doc.fileName,
      filePath: resolved,
      kind,
      mimeType,
      text,
      html
    }
  }

  public deleteDoc(docId: string): KnowledgeBaseState {
    const doc = this.getDocById(docId)
    if (doc) {
      const resolved = path.resolve(doc.filePath)
      const rootResolved = path.resolve(this.storageDir)
      if (resolved.startsWith(rootResolved + path.sep) && fs.existsSync(resolved)) {
        try {
          fs.unlinkSync(resolved)
        } catch (err) {
          console.error('Failed to delete knowledge document:', err)
        }
      }
      const metaMap = this.loadMetaMap()
      metaMap.delete(doc.fileName)
      this.saveMetaMap(metaMap)
    }

    const state = this.getState()
    this.broadcast({
      type: 'knowledge_docs_updated',
      knowledgeDocs: state.docs
    })
    return state
  }
}
