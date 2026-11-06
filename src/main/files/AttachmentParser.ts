import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'
import { ChatAttachment } from '@shared/types'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.jpj', '.webp', '.gif', '.bmp', '.svg'])
const WORD_EXTS = new Set(['.docx', '.doc', '.rtf', '.odt'])
const PDF_EXTS = new Set(['.pdf'])
const EXCEL_EXTS = new Set(['.xlsx', '.xls', '.csv', '.tsv'])

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getHelperBinaryPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'resources', 'mac-doc-helper'),
    path.resolve(__dirname, '../../resources/mac-doc-helper'),
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      ? path.join(
          (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!,
          'mac-doc-helper'
        )
      : ''
  ].filter(Boolean)

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function guessMimeType(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
    case '.jpj':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.bmp':
      return 'image/bmp'
    case '.pdf':
      return 'application/pdf'
    case '.tex':
      return 'text/x-tex'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.doc':
      return 'application/msword'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.csv':
      return 'text/csv'
    case '.tsv':
      return 'text/tab-separated-values'
    default:
      return 'text/plain'
  }
}

export class AttachmentParser {
  /** 单文件允许输入解析的最大字节上限：150 MB (极大拓宽大文件、高清设计图与大型数据集支持) */
  static readonly MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024

  /** 文本与文档提取至对话上下文的最大字符上限：180,000 字符（对应约 4.5万~9万 Tokens，深度释放 200k 上下文容量） */
  static readonly MAX_TEXT_EXTRACT_CHARS = 180_000

  /** PDF OCR 视觉解析最大页数上限：80 页（由原有 30 页扩充） */
  static readonly MAX_PDF_OCR_PAGES = 80

  /** 表格解析行数上限：3,000 行（由原有 500/600 行扩充） */
  static readonly MAX_EXCEL_PARSE_ROWS = 3000

  /** 表格提示词预览行数上限：200 行（由原有 60 行扩充） */
  static readonly MAX_EXCEL_PREVIEW_ROWS = 200

  /** 图像触发智能压缩的文件大小阈值：8 MB（由原有 1.5 MB 扩充，减少不必要的画质损失） */
  static readonly IMAGE_COMPRESS_SIZE_THRESHOLD = 8 * 1024 * 1024

  /** 图像触发智能压缩的像素分辨率阈值：3200 像素（由原有 1800 像素扩充，完美保留 4K 截图与长图细节） */
  static readonly IMAGE_COMPRESS_DIM_THRESHOLD = 3200

  /** 图像压缩目标最长边：2560 像素（由原有 1568 像素扩充） */
  static readonly IMAGE_TARGET_DIMENSION = 2560

  /** 图像压缩 JPEG 质量：88（由原有 82 提升，确保微小代码文本清晰可读） */
  static readonly IMAGE_COMPRESS_QUALITY = 88

  /** SVG 矢量图提取字符上限：60,000 字符（由原有 12,000 字符扩充） */
  static readonly MAX_SVG_CHARS = 60_000

  /** 外部命令行工具 (textutil, pdftotext, python3 等) 的执行缓冲区：64 MB */
  static readonly EXEC_MAX_BUFFER = 64 * 1024 * 1024

  static readonly DIALOG_FILTERS = [
    {
      name: '全部支持格式 (图像 / PDF / Word / LaTeX / Excel 表格 / 文本与代码)',
      extensions: [
        'png',
        'jpg',
        'jpeg',
        'jpj',
        'webp',
        'gif',
        'bmp',
        'svg',
        'pdf',
        'tex',
        'docx',
        'doc',
        'rtf',
        'odt',
        'xlsx',
        'xls',
        'csv',
        'tsv',
        'txt',
        'md',
        'markdown',
        'json',
        'jsonl',
        'yaml',
        'yml',
        'xml',
        'html',
        'css',
        'js',
        'jsx',
        'ts',
        'tsx',
        'py',
        'rs',
        'go',
        'c',
        'cpp',
        'h',
        'hpp',
        'java',
        'swift',
        'sh',
        'sql',
        'toml',
        'ini',
        'log'
      ]
    },
    {
      name: '图像 (PNG / JPG / JPJ / WEBP / GIF)',
      extensions: ['png', 'jpg', 'jpeg', 'jpj', 'webp', 'gif', 'bmp', 'svg']
    },
    {
      name: '文档 (PDF / DOCX / DOC / TEX / RTF)',
      extensions: ['pdf', 'docx', 'doc', 'tex', 'rtf', 'odt']
    },
    {
      name: '表格 (Excel / CSV / TSV)',
      extensions: ['xlsx', 'xls', 'csv', 'tsv']
    },
    {
      name: '文本与源码 (TXT / MD / TEX / CSV / JSON / Code)',
      extensions: ['txt', 'md', 'tex', 'csv', 'json', 'yaml', 'yml', 'xml', 'ts', 'tsx', 'js', 'py', 'rs', 'c', 'cpp', 'go', 'log']
    }
  ]

  static parseFile(filePath: string, displayName?: string): ChatAttachment | null {
    try {
      if (!fs.existsSync(filePath)) return null
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return null

      const name = displayName || path.basename(filePath)
      const ext = (path.extname(name) || path.extname(filePath)).toLowerCase()
      const mimeType = guessMimeType(ext)
      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      // 超出 150MB 单文件上限时给予明确友好结构，避免内存耗尽
      if (stat.size > this.MAX_FILE_SIZE_BYTES) {
        const label = ext.replace('.', '').toUpperCase() || 'FILE'
        return {
          id,
          name,
          ext: label,
          kind: 'text',
          mimeType,
          sizeBytes: stat.size,
          filePath,
          extractedText: `[文件过大提示: ${name} 体积为 ${formatBytes(stat.size)}，超出单文件解析上限 (${formatBytes(this.MAX_FILE_SIZE_BYTES)})。建议截取关键章节、抽取数据子集或在终端直接分析该路径: ${filePath}]`,
          summaryMeta: `${label} · ${formatBytes(stat.size)} (超限)`
        }
      }

      // 1. Image Attachments (PNG, JPG, JPEG, JPJ, WEBP, GIF, BMP, SVG)
      if (IMAGE_EXTS.has(ext)) {
        return this.parseImageAttachment(id, filePath, name, ext, mimeType, stat.size)
      }

      // 2. PDF Attachments
      if (PDF_EXTS.has(ext)) {
        return this.parsePdfAttachment(id, filePath, name, ext, mimeType, stat.size)
      }

      // 3. Word / Rich Text Documents (.docx, .doc, .rtf, .odt)
      if (WORD_EXTS.has(ext)) {
        return this.parseWordAttachment(id, filePath, name, ext, mimeType, stat.size)
      }

      // 4. Excel / CSV / TSV Spreadsheets (.xlsx, .xls, .csv, .tsv)
      if (EXCEL_EXTS.has(ext)) {
        return this.parseExcelAttachment(id, filePath, name, ext, mimeType, stat.size)
      }

      // 5. Plain Text / Markdown / JSON / Source Code
      return this.parseTextAttachment(id, filePath, name, ext, mimeType, stat.size)
    } catch (err) {
      console.error('AttachmentParser.parseFile error:', err)
      return null
    }
  }

  /**
   * Parses pasted clipboard images or dragged File blobs sent as base64 / data URL.
   */
  static parseDataPayload(payload: {
    name: string
    mimeType?: string
    dataBase64: string
  }): ChatAttachment | null {
    const cleanBase64 = payload.dataBase64.includes(',')
      ? payload.dataBase64.split(',')[1]
      : payload.dataBase64
    const buf = Buffer.from(cleanBase64, 'base64')
    const ext =
      path.extname(payload.name).toLowerCase() ||
      (payload.mimeType?.includes('png')
        ? '.png'
        : payload.mimeType?.includes('jpeg') || payload.mimeType?.includes('jpg')
          ? '.jpg'
          : payload.mimeType?.includes('pdf')
            ? '.pdf'
            : payload.mimeType?.includes('word')
              ? '.docx'
              : '.txt')

    const tmpFile = path.join(
      os.tmpdir(),
      `claude_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`
    )
    try {
      fs.writeFileSync(tmpFile, buf)
      const finalName = path.extname(payload.name) ? payload.name : `${payload.name}${ext}`
      return this.parseFile(tmpFile, finalName)
    } finally {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
      } catch {
        // ignore
      }
    }
  }

  private static parseImageAttachment(
    id: string,
    filePath: string,
    name: string,
    ext: string,
    mimeType: string,
    sizeBytes: number
  ): ChatAttachment {
    let width = 0
    let height = 0

    // Read image dimensions via macOS `sips`
    if (ext !== '.svg' && fs.existsSync('/usr/bin/sips')) {
      try {
        const info = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
          encoding: 'utf-8',
          timeout: 2500
        })
        const wMatch = info.match(/pixelWidth:\s*(\d+)/)
        const hMatch = info.match(/pixelHeight:\s*(\d+)/)
        if (wMatch) width = Number(wMatch[1])
        if (hMatch) height = Number(hMatch[1])
      } catch {
        // ignore
      }
    }

    // Downscale huge images (> 8MB or > 3200px) via `sips` so base64 payloads stay nimble while keeping ultra-sharp resolution
    let previewDataUrl = ''
    const needsCompress =
      ext !== '.svg' &&
      ext !== '.gif' &&
      fs.existsSync('/usr/bin/sips') &&
      (sizeBytes > this.IMAGE_COMPRESS_SIZE_THRESHOLD ||
        width > this.IMAGE_COMPRESS_DIM_THRESHOLD ||
        height > this.IMAGE_COMPRESS_DIM_THRESHOLD ||
        ext === '.bmp')

    if (needsCompress) {
      const tmpJpg = path.join(os.tmpdir(), `claude_img_${id}.jpg`)
      try {
        execFileSync(
          '/usr/bin/sips',
          [
            '-Z',
            String(this.IMAGE_TARGET_DIMENSION),
            '-s',
            'format',
            'jpeg',
            '-s',
            'formatOptions',
            String(this.IMAGE_COMPRESS_QUALITY),
            filePath,
            '--out',
            tmpJpg
          ],
          { stdio: 'ignore', timeout: 6000 }
        )
        if (fs.existsSync(tmpJpg)) {
          const b64 = fs.readFileSync(tmpJpg).toString('base64')
          previewDataUrl = `data:image/jpeg;base64,${b64}`
        }
      } catch {
        // fallback below
      } finally {
        try {
          if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg)
        } catch {
          // ignore
        }
      }
    }

    if (!previewDataUrl) {
      const b64 = fs.readFileSync(filePath).toString('base64')
      const safeMime = ext === '.jpj' ? 'image/jpeg' : mimeType
      previewDataUrl = `data:${safeMime};base64,${b64}`
    }

    // Run Apple Vision Neural OCR (`zh-Hans` + `en-US`) so text-only reasoning models (like deepseek-reasoner) also understand every word in the image!
    let ocrText = ''
    const helper = getHelperBinaryPath()
    if (helper && ext !== '.svg') {
      try {
        ocrText = execFileSync(helper, ['ocr', filePath], {
          encoding: 'utf-8',
          timeout: 8000,
          maxBuffer: this.EXEC_MAX_BUFFER
        }).trim()
      } catch {
        ocrText = ''
      }
    } else if (ext === '.svg') {
      ocrText = fs.readFileSync(filePath, 'utf-8').slice(0, this.MAX_SVG_CHARS)
    }

    const dimLabel = width && height ? `${width}×${height}` : formatBytes(sizeBytes)
    return {
      id,
      name,
      ext: ext.replace('.', '').toUpperCase() || 'IMG',
      kind: 'image',
      mimeType: ext === '.jpj' ? 'image/jpeg' : mimeType,
      sizeBytes,
      filePath,
      previewDataUrl,
      extractedText: ocrText || undefined,
      summaryMeta: `${ext.replace('.', '').toUpperCase()} · ${dimLabel}`
    }
  }

  private static parsePdfAttachment(
    id: string,
    filePath: string,
    name: string,
    ext: string,
    mimeType: string,
    sizeBytes: number
  ): ChatAttachment {
    let extracted = ''
    let pages = 0
    let ocrRepaired = false

    // 1. Try Poppler `/opt/homebrew/bin/pdfinfo` & `pdftotext`
    if (fs.existsSync('/opt/homebrew/bin/pdfinfo')) {
      try {
        const info = execFileSync('/opt/homebrew/bin/pdfinfo', [filePath], {
          encoding: 'utf-8',
          timeout: 3000
        })
        const pMatch = info.match(/Pages:\s*(\d+)/)
        if (pMatch) pages = Number(pMatch[1])
      } catch {
        // ignore
      }
    }

    if (fs.existsSync('/opt/homebrew/bin/pdftotext')) {
      try {
        extracted = execFileSync('/opt/homebrew/bin/pdftotext', ['-layout', filePath, '-'], {
          encoding: 'utf-8',
          timeout: 12000,
          maxBuffer: this.EXEC_MAX_BUFFER
        }).trim()
      } catch {
        extracted = ''
      }
    }

    // 2. Fallback to native macOS PDFKit helper (`resources/mac-doc-helper pdf`)
    if (!extracted) {
      const helper = getHelperBinaryPath()
      if (helper) {
        try {
          extracted = execFileSync(helper, ['pdf', filePath], {
            encoding: 'utf-8',
            timeout: 12000,
            maxBuffer: this.EXEC_MAX_BUFFER
          }).trim()
          const pMatch = extracted.match(/\[PDF 共 (\d+) 页\]/)
          if (pMatch && !pages) pages = Number(pMatch[1])
        } catch {
          extracted = ''
        }
      }
    }

    // 3. Heuristic Mojibake & Scanned PDF Detection:
    // If text layer is missing (pure scan) OR contains CMap subset mojibake (e.g. `MPC 楗☠†Hz糹ᶣ︙猠飒`),
    // automatically rasterize the PDF pages and run macOS Apple Vision neural OCR.
    const garbled = this.detectGarbledPdfText(extracted)
    const isScanPdf = !extracted || extracted.length < 50

    if (garbled.isGarbled || isScanPdf) {
      console.log(
        `[AttachmentParser] PDF 触发光栅化 OCR 重构: ${
          isScanPdf ? '无可选中文本层(纯扫描件)' : garbled.reason
        }`
      )
      const ocrLimit = pages > 0 ? Math.min(pages, this.MAX_PDF_OCR_PAGES) : this.MAX_PDF_OCR_PAGES
      const ocrText = this.ocrPdfAttachment(filePath, ocrLimit)
      if (ocrText && ocrText.length > (isScanPdf ? 10 : 30)) {
        extracted = ocrText
        ocrRepaired = true
        if (!pages) {
          const pMatch = ocrText.match(/\[PDF 共 (\d+) 页/)
          if (pMatch) pages = Number(pMatch[1])
        }
      }
    }

    const capped =
      extracted.length > this.MAX_TEXT_EXTRACT_CHARS
        ? `${extracted.slice(0, this.MAX_TEXT_EXTRACT_CHARS)}\n\n...[PDF 后续内容已截断，原提取总长 ${extracted.length} 字符]`
        : extracted || '(未能从该 PDF 提取到可选中文本层，可能是纯扫描件或光栅化失败)'

    const summaryMeta = ocrRepaired
      ? pages > 0
        ? `PDF · ${pages} 页 (已通过 Vision OCR 纠正字体乱码)`
        : `PDF · 视觉 OCR 修复`
      : pages > 0
        ? `PDF · ${pages} 页`
        : `PDF · ${formatBytes(sizeBytes)}`

    return {
      id,
      name,
      ext: 'PDF',
      kind: 'pdf',
      mimeType,
      sizeBytes,
      filePath,
      extractedText: capped,
      summaryMeta
    }
  }

  /**
   * Heuristic detection for PDF font subset / CMap mojibake (乱码)
   * When academic/technical PDFs have missing or corrupted ToUnicode CMaps,
   * heading fonts get decoded into Braille characters (⠆), Private Use Area (PUA),
   * phonetic modifier letters (ᶣ, ᶠ), skulls/dingbats (☠, †), dotted circle (◌),
   * and presentation forms (︙) interspersed with normal Latin/CJK text.
   */
  static detectGarbledPdfText(text: string): {
    isGarbled: boolean
    severeMatchesCount: number
    garbledLineCount: number
    sampleGarbledLine?: string
    reason?: string
  } {
    if (!text || text.length < 5) {
      return { isGarbled: false, severeMatchesCount: 0, garbledLineCount: 0 }
    }

    // 1. Severe mojibake glyphs that almost never occur in legitimate Chinese/English academic text:
    // - Braille patterns: \u2800-\u28FF (e.g. ⠆)
    // - Private Use Area (PUA): \uE000-\uF8FF
    // - Phonetic modifier letters & tone markers: \u1D00-\u1DBF (e.g. ᶣ, ᶠ)
    // - Vertical presentation forms: \uFE10-\uFE1F (e.g. ︙)
    // - Replacement character: \uFFFD
    // - Dotted circle: \u25CC (◌)
    // - Specific dingbats / skulls: \u2620 (☠), \u2622-\u267F
    const severeMojibakeRegex =
      /[\u2800-\u28FF\uE000-\uF8FF\u1D00-\u1DBF\uFE10-\uFE1F\u25CC\uFFFD\u2620\u2622-\u267F]/g
    const severeMatches = text.match(severeMojibakeRegex) || []

    // 2. Line-level heading check:
    // Academic PDF headings are typically short lines (< 120 chars).
    // If a short line has severe mojibake characters, or daggers/math operators embedded directly in words
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    let garbledLineCount = 0
    let sampleGarbledLine = ''

    // Detects characters like '楗☠†Hz糹' or '◌Hz⩽⋓畩'
    const titleSuspiciousPattern =
      /(?:[A-Za-z\u4e00-\u9fa5][\u2020\u2021\u2200-\u22FF\u2A00-\u2AFF\u2600-\u27BF][A-Za-z\u4e00-\u9fa5])|[\u2800-\u28FF\uE000-\uF8FF\u1D00-\u1DBF\uFE10-\uFE1F\u25CC\uFFFD\u2620]/

    for (const line of lines) {
      if (line.length <= 120 && titleSuspiciousPattern.test(line)) {
        garbledLineCount++
        if (!sampleGarbledLine) {
          sampleGarbledLine = line
        }
      }
    }

    const severeRatio = severeMatches.length / text.length
    const isGarbled = severeMatches.length >= 2 || garbledLineCount >= 1 || severeRatio > 0.005

    let reason = ''
    if (isGarbled) {
      if (sampleGarbledLine) {
        reason = `章节标题/行出现中文字体子集内码冲突 (样本: "${sampleGarbledLine.slice(0, 40)}")`
      } else if (severeMatches.length > 0) {
        reason = `文档含 ${severeMatches.length} 处盲文/私有区/符号杂凑乱码`
      } else {
        reason = `异常符号占比超过安全阈值 (${(severeRatio * 100).toFixed(2)}%)`
      }
    }

    return {
      isGarbled,
      severeMatchesCount: severeMatches.length,
      garbledLineCount,
      sampleGarbledLine,
      reason
    }
  }

  /**
   * Rasterizes PDF pages into bitmap images and runs macOS Apple Vision Neural OCR.
   * Completely immune to ToUnicode CMap corruptions or font subset errors.
   */
  private static ocrPdfAttachment(filePath: string, maxPages: number = AttachmentParser.MAX_PDF_OCR_PAGES): string {
    const helper = getHelperBinaryPath()
    if (helper) {
      try {
        const ocrText = execFileSync(helper, ['pdf-ocr', filePath, String(maxPages)], {
          encoding: 'utf-8',
          timeout: 45000,
          maxBuffer: this.EXEC_MAX_BUFFER
        }).trim()
        if (ocrText && ocrText.length > 20) {
          return ocrText
        }
      } catch (err) {
        console.warn('[AttachmentParser] mac-doc-helper pdf-ocr failed, trying sips fallback:', err)
      }
    }

    // Fallback: use macOS `sips` to rasterize page to png and call helper ocr
    if (helper && fs.existsSync('/usr/bin/sips')) {
      const tmpPng = path.join(os.tmpdir(), `claude_pdf_ocr_${Date.now()}.png`)
      try {
        execFileSync('/usr/bin/sips', ['-s', 'format', 'png', filePath, '--out', tmpPng], {
          stdio: 'ignore',
          timeout: 12000
        })
        if (fs.existsSync(tmpPng)) {
          const ocrText = execFileSync(helper, ['ocr', tmpPng], {
            encoding: 'utf-8',
            timeout: 15000,
            maxBuffer: this.EXEC_MAX_BUFFER
          }).trim()
          if (ocrText) return ocrText
        }
      } catch {
        // ignore
      } finally {
        try {
          if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng)
        } catch {
          // ignore
        }
      }
    }

    return ''
  }

  private static parseWordAttachment(
    id: string,
    filePath: string,
    name: string,
    ext: string,
    mimeType: string,
    sizeBytes: number
  ): ChatAttachment {
    let extracted = ''

    // 1. macOS built-in `/usr/bin/textutil` handles `.docx`, `.doc`, `.rtf`, `.odt` natively
    if (fs.existsSync('/usr/bin/textutil')) {
      try {
        extracted = execFileSync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', filePath], {
          encoding: 'utf-8',
          timeout: 10000,
          maxBuffer: this.EXEC_MAX_BUFFER
        }).trim()
      } catch {
        extracted = ''
      }
    }

    // 2. Fallback: `.docx` OpenXML `word/document.xml` unzip extraction
    if (!extracted && ext === '.docx' && fs.existsSync('/usr/bin/unzip')) {
      try {
        const xml = execFileSync('/usr/bin/unzip', ['-p', filePath, 'word/document.xml'], {
          encoding: 'utf-8',
          timeout: 8000,
          maxBuffer: this.EXEC_MAX_BUFFER
        })
        extracted = xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      } catch {
        extracted = ''
      }
    }

    const capped =
      extracted.length > this.MAX_TEXT_EXTRACT_CHARS
        ? `${extracted.slice(0, this.MAX_TEXT_EXTRACT_CHARS)}\n\n...[文档后续内容已截断，原长 ${extracted.length} 字符]`
        : extracted || '(文档内容为空或无法解析)'

    const label = ext.replace('.', '').toUpperCase() || 'DOCX'
    return {
      id,
      name,
      ext: label,
      kind: 'docx',
      mimeType,
      sizeBytes,
      filePath,
      extractedText: capped,
      summaryMeta: `${label} · ${extracted.length} 字`
    }
  }

  private static parseExcelAttachment(
    id: string,
    filePath: string,
    name: string,
    ext: string,
    mimeType: string,
    sizeBytes: number
  ): ChatAttachment {
    const excelData = this.parseExcelSpreadsheet(filePath)
    const label = ext.replace('.', '').toUpperCase() || 'XLSX'

    let textSummary = `[表格文件: ${name} (${label}) - 共 ${excelData.sheets.length} 个工作表 / ${excelData.totalRows} 行]\n\n`
    for (const sheet of excelData.sheets) {
      const previewLimit = Math.min(sheet.rows.length, this.MAX_EXCEL_PREVIEW_ROWS)
      textSummary += `### 工作表: ${sheet.name} (前 ${previewLimit} 行预览)\n`
      if (sheet.rows.length > 0) {
        const headerRow = sheet.rows[0]
        textSummary += `| ${headerRow.join(' | ')} |\n`
        textSummary += `| ${headerRow.map(() => '---').join(' | ')} |\n`
        for (const row of sheet.rows.slice(1, previewLimit)) {
          textSummary += `| ${row.join(' | ')} |\n`
        }
        if (sheet.rows.length > previewLimit) {
          textSummary += `\n... [当前工作表剩余 ${sheet.rows.length - previewLimit} 行在侧边浏览区可查看全部]\n`
        }
      } else {
        textSummary += `(该工作表为空)\n`
      }
      textSummary += '\n'
    }

    return {
      id,
      name,
      ext: label,
      kind: 'excel',
      mimeType,
      sizeBytes,
      filePath,
      excelData,
      extractedText: textSummary,
      summaryMeta:
        excelData.sheets.length > 1
          ? `${label} · ${excelData.sheets.length} 个工作表 / ${excelData.totalRows} 行`
          : `${label} · ${excelData.totalRows} 行 / ${excelData.totalCols} 列`
    }
  }

  static parseExcelSpreadsheet(filePath: string): {
    sheets: Array<{ name: string; rows: string[][] }>
    totalRows: number
    totalCols: number
  } {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.csv' || ext === '.tsv') {
      try {
        const delimiter = ext === '.tsv' ? '\t' : ','
        const content = fs.readFileSync(filePath, 'utf-8')
        const rows: string[][] = []
        for (const line of content.split(/\r?\n/)) {
          if (!line.trim()) continue
          const row: string[] = []
          let cur = ''
          let inQuotes = false
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === delimiter && !inQuotes) {
              row.push(cur.trim())
              cur = ''
            } else {
              cur += char
            }
          }
          row.push(cur.trim())
          rows.push(row)
          if (rows.length >= this.MAX_EXCEL_PARSE_ROWS) break
        }
        const maxCols = rows.reduce((max, r) => Math.max(max, r.length), 0)
        return {
          sheets: [{ name: path.basename(filePath), rows }],
          totalRows: rows.length,
          totalCols: maxCols
        }
      } catch (err) {
        console.warn('CSV parse failed:', err)
      }
    }

    if (ext === '.xlsx') {
      const pyScript = `
import sys, json, zipfile, xml.etree.ElementTree as ET
try:
    with zipfile.ZipFile(sys.argv[1], 'r') as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                shared_strings.append(''.join([t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]))
        sheet_names = []
        if 'xl/workbook.xml' in z.namelist():
            wb = ET.fromstring(z.read('xl/workbook.xml'))
            sheets = wb.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets')
            if sheets is not None:
                for s in sheets:
                    sheet_names.append(s.attrib.get('name', 'Sheet'))
        sheets_data = []
        idx = 1
        while f'xl/worksheets/sheet{idx}.xml' in z.namelist():
            s_name = sheet_names[idx-1] if idx-1 < len(sheet_names) else f'Sheet{idx}'
            stree = ET.fromstring(z.read(f'xl/worksheets/sheet{idx}.xml'))
            sheet_data = stree.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData')
            rows = []
            if sheet_data is not None:
                for r_el in sheet_data.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                    row_vals = []
                    for c in r_el.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        v = ''
                        t = c.attrib.get('t')
                        v_el = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        if v_el is not None and v_el.text:
                            if t == 's':
                                si_idx = int(v_el.text)
                                if si_idx < len(shared_strings):
                                    v = shared_strings[si_idx]
                            else:
                                v = v_el.text
                        elif t == 'inlineStr':
                            is_el = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is')
                            if is_el is not None:
                                t_el = is_el.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                                if t_el is not None and t_el.text:
                                    v = t_el.text
                        row_vals.append(v)
                    if any(row_vals):
                        rows.append(row_vals)
            sheets_data.append({'name': s_name, 'rows': rows[:${this.MAX_EXCEL_PARSE_ROWS}]})
            idx += 1
        total_rows = sum(len(s['rows']) for s in sheets_data)
        max_cols = max([max([len(r) for r in s['rows']] or [0]) for s in sheets_data] or [0])
        print(json.dumps({'sheets': sheets_data, 'totalRows': total_rows, 'totalCols': max_cols}))
except Exception as e:
    print(json.dumps({'sheets': [], 'totalRows': 0, 'totalCols': 0, 'error': str(e)}))
`
      try {
        const out = execFileSync('/usr/bin/python3', ['-c', pyScript, filePath], {
          encoding: 'utf-8',
          timeout: 15000,
          maxBuffer: this.EXEC_MAX_BUFFER
        }).trim()
        const parsed = JSON.parse(out)
        if (parsed.sheets && parsed.sheets.length > 0) {
          return parsed
        }
      } catch (err) {
        console.warn('Python xlsx parse failed:', err)
      }
    }

    return { sheets: [], totalRows: 0, totalCols: 0 }
  }

  static convertDocxToHtml(filePath: string): string {
    if (fs.existsSync('/usr/bin/textutil')) {
      try {
        const html = execFileSync('/usr/bin/textutil', ['-convert', 'html', '-stdout', filePath], {
          encoding: 'utf-8',
          timeout: 10000,
          maxBuffer: this.EXEC_MAX_BUFFER
        })
        if (html) return html
      } catch (err) {
        console.warn('textutil convert docx to html failed:', err)
      }
    }
    return ''
  }

  private static parseTextAttachment(
    id: string,
    filePath: string,
    name: string,
    ext: string,
    mimeType: string,
    sizeBytes: number
  ): ChatAttachment {
    const buf = fs.readFileSync(filePath)
    const isBinary = buf.subarray(0, Math.min(4096, buf.length)).includes(0)
    const raw = isBinary
      ? `[二进制文件: ${name} (${formatBytes(sizeBytes)})，如需分析二进制结构可在对话中使用逆向分析工具读取路径 ${filePath}]`
      : buf.toString('utf-8')
    const lineCount = isBinary ? 1 : raw.split('\n').length
    const capped =
      raw.length > this.MAX_TEXT_EXTRACT_CHARS
        ? `${raw.slice(0, this.MAX_TEXT_EXTRACT_CHARS)}\n\n...[文本后续内容已截断，共 ${lineCount} 行 / ${raw.length} 字符]`
        : raw
    const label = ext.replace('.', '').toUpperCase() || 'TXT'

    return {
      id,
      name,
      ext: label,
      kind: 'text',
      mimeType,
      sizeBytes,
      filePath,
      extractedText: capped,
      summaryMeta: isBinary ? `${label} · ${formatBytes(sizeBytes)}` : `${label} · ${lineCount} 行`
    }
  }
}
