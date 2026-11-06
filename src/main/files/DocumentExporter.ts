import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import { execFileSync } from 'child_process'
import { DocExportFormat, DocPresetType, ExportDocumentPayload } from '@shared/types'

export function sanitizeDocFileName(rawTitle: string, fallback = '未命名排版文档'): string {
  const cleaned = (rawTitle || '')
    .replace(/^#+\s*/, '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
  return cleaned || fallback
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isTableDividerLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('-') || !trimmed.includes('|')) return false
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const parts = stripped.split('|')
  return parts.length > 0 && parts.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))
}

export class DocumentExporter {
  /**
   * Builds a standalone, print-calibrated HTML5 document matching the active preset.
   */
  static buildStyledHtml(payload: {
    title: string
    markdown: string
    htmlBody: string
    preset: DocPresetType
  }): string {
    const isFormal = payload.preset === 'formal'
    const isCompact = payload.preset === 'compact'
    const isWeChat = payload.preset === 'wechat'

    const fontStack = isFormal
      ? '"Songti SC", "STSong", "SimSun", "FangSong", "Noto Serif CJK SC", Georgia, serif'
      : '-apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", "Microsoft YaHei", "Helvetica Neue", sans-serif'

    const baseFontSize = isCompact ? '12.5px' : isFormal ? '15px' : '14px'
    const baseLineHeight = isCompact ? '1.6' : isFormal ? '1.88' : '1.78'

    const bodyContent =
      isWeChat && !payload.htmlBody.trim()
        ? `<pre class="wechat-plain">${escapeHtml(payload.markdown)}</pre>`
        : payload.htmlBody

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title || '排版文档')}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 18mm 18mm 18mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: ${fontStack};
      font-size: ${baseFontSize};
      line-height: ${baseLineHeight};
      color: ${isFormal ? '#111111' : '#1f2329'};
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
    }
    h1, .doc-h1 {
      font-size: ${isFormal ? '24px' : isCompact ? '20px' : '23px'};
      font-weight: 700;
      line-height: 1.35;
      margin: 0 0 14px 0;
      padding-bottom: ${isFormal ? '10px' : '6px'};
      border-bottom: ${isFormal ? '2px solid #c41e16' : '1px solid #e5e7eb'};
      text-align: ${isFormal ? 'center' : 'left'};
      color: #111827;
      page-break-after: avoid;
    }
    h2, .doc-h2 {
      font-size: ${isCompact ? '16px' : '18px'};
      font-weight: 650;
      line-height: 1.4;
      margin: 20px 0 10px 0;
      color: #1f2329;
      page-break-after: avoid;
    }
    h3, .doc-h3 {
      font-size: ${isCompact ? '14px' : '15.5px'};
      font-weight: 600;
      line-height: 1.45;
      margin: 16px 0 8px 0;
      color: #1f2329;
      page-break-after: avoid;
    }
    h4, .doc-h4 {
      font-size: 14px;
      font-weight: 600;
      margin: 12px 0 6px 0;
      color: #374151;
    }
    p, .doc-p {
      margin: ${isCompact ? '6px 0' : '10px 0'};
      text-indent: ${isFormal ? '2em' : '0'};
      word-break: break-word;
    }
    ul, ol, .doc-ul, .doc-ol {
      padding-left: 24px;
      margin: 10px 0;
    }
    li {
      margin: ${isCompact ? '3px 0' : '5px 0'};
      line-height: ${baseLineHeight};
    }
    table, .feishu-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: ${isCompact ? '12px' : '13px'};
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th, td {
      border: 1px solid #d0d5dd;
      padding: ${isCompact ? '6px 9px' : '8px 12px'};
      text-align: left;
      vertical-align: top;
    }
    th {
      background-color: #f4f6f8;
      font-weight: 600;
      color: #111827;
    }
    code, .doc-code {
      background-color: #f2f4f7;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 0.9em;
      color: #0f172a;
    }
    pre {
      background-color: #f6f8fa;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px 14px;
      font-family: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
    }
    blockquote, .doc-blockquote {
      border-left: 3.5px solid ${isFormal ? '#c41e16' : '#0071e3'};
      background-color: #f8fafc;
      padding: 8px 14px;
      margin: 12px 0;
      color: #475467;
      border-radius: 0 6px 6px 0;
      page-break-inside: avoid;
    }
    a {
      color: #0071e3;
      text-decoration: none;
    }
    .wechat-plain {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
      font-size: 14px;
      line-height: 1.65;
      background: #ffffff;
      border: none;
      padding: 0;
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`
  }

  /**
   * Generates a binary Word (.doc) buffer.
   * Uses native macOS `/usr/bin/textutil -convert doc` for genuine OLE2 binary `.doc`,
   * with cross-platform Microsoft WordprocessingML HTML `.doc` fallback.
   */
  static generateDocBuffer(payload: ExportDocumentPayload): Buffer {
    const html = this.buildStyledHtml(payload)

    if (fs.existsSync('/usr/bin/textutil')) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const tmpHtml = path.join(os.tmpdir(), `claude_export_${id}.html`)
      const tmpDoc = path.join(os.tmpdir(), `claude_export_${id}.doc`)
      try {
        fs.writeFileSync(tmpHtml, html, 'utf-8')
        execFileSync('/usr/bin/textutil', ['-convert', 'doc', tmpHtml, '-output', tmpDoc], {
          timeout: 8000
        })
        if (fs.existsSync(tmpDoc)) {
          return fs.readFileSync(tmpDoc)
        }
      } catch {
        // Fallback to Word HTML below
      } finally {
        try {
          if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml)
          if (fs.existsSync(tmpDoc)) fs.unlinkSync(tmpDoc)
        } catch {
          // ignore
        }
      }
    }

    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
</head><body>${payload.htmlBody}</body></html>`
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(wordHtml, 'utf-8')])
  }

  /**
   * Generates a genuine Office OpenXML (.docx) buffer with full native Word tables,
   * headings, lists, blockquotes, code blocks, and CJK typography — zero external dependencies.
   */
  static generateDocxBuffer(payload: ExportDocumentPayload): Buffer {
    const isFormal = payload.preset === 'formal'
    const isCompact = payload.preset === 'compact'
    const cjkFont = isFormal ? 'Songti SC' : 'PingFang SC'
    const asciiFont = isFormal ? 'Times New Roman' : 'Calibri'

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

    const bodyFontHalfPt = isCompact ? 21 : isFormal ? 24 : 22 // 10.5pt / 12pt / 11pt
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${asciiFont}" w:hAnsi="${asciiFont}" w:eastAsia="${cjkFont}" w:cs="${asciiFont}"/>
        <w:sz w:val="${bodyFontHalfPt}"/>
        <w:szCs w:val="${bodyFontHalfPt}"/>
        <w:color w:val="1F2329"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="${isCompact ? '100' : '140'}" w:line="${isFormal ? '380' : '340'}" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`

    const documentBodyXml = this.markdownToWordXmlBody(payload.markdown, {
      isFormal,
      isCompact,
      bodyFontHalfPt
    })

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${documentBodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1240" w:right="1240" w:bottom="1240" w:left="1240" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`

    return buildZipArchive([
      { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf-8') },
      { name: '_rels/.rels', data: Buffer.from(rootRelsXml, 'utf-8') },
      { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRelsXml, 'utf-8') },
      { name: 'word/styles.xml', data: Buffer.from(stylesXml, 'utf-8') },
      { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf-8') }
    ])
  }

  private static markdownToWordXmlBody(
    markdown: string,
    opts: { isFormal: boolean; isCompact: boolean; bodyFontHalfPt: number }
  ): string {
    const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
    const blocks: string[] = []

    const renderInlineRuns = (
      raw: string,
      extraRPr = ''
    ): string => {
      if (!raw) return `<w:r><w:rPr>${extraRPr}</w:rPr><w:t></w:t></w:r>`
      const tokenRegex =
        /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|(?<!\*)\*[^*]+\*(?!\*))/g
      const runs: string[] = []
      let lastIdx = 0
      let m: RegExpExecArray | null

      const pushPlain = (txt: string, rPr = ''): void => {
        if (!txt) return
        runs.push(
          `<w:r><w:rPr>${extraRPr}${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`
        )
      }

      while ((m = tokenRegex.exec(raw)) !== null) {
        if (m.index > lastIdx) {
          pushPlain(raw.slice(lastIdx, m.index))
        }
        const tok = m[0]
        if (tok.startsWith('`')) {
          pushPlain(
            tok.slice(1, -1),
            '<w:rFonts w:ascii="Menlo" w:hAnsi="Menlo" w:eastAsia="PingFang SC"/><w:color w:val="0F172A"/><w:shd w:val="clear" w:color="auto" w:fill="F2F4F7"/>'
          )
        } else if (tok.startsWith('**') || tok.startsWith('__')) {
          pushPlain(tok.slice(2, -2), '<w:b/><w:bCs/>')
        } else if (tok.startsWith('~~')) {
          pushPlain(tok.slice(2, -2), '<w:strike/>')
        } else if (tok.startsWith('[')) {
          const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
          if (linkMatch) {
            pushPlain(linkMatch[1], '<w:color w:val="0071E3"/><w:u w:val="single"/>')
            if (linkMatch[2] && linkMatch[2] !== linkMatch[1]) {
              pushPlain(` (${linkMatch[2]})`, '<w:color w:val="646A73"/><w:sz w:val="18"/>')
            }
          } else {
            pushPlain(tok)
          }
        } else {
          pushPlain(tok.slice(1, -1), '<w:i/><w:iCs/>')
        }
        lastIdx = m.index + tok.length
      }

      if (lastIdx < raw.length) {
        pushPlain(raw.slice(lastIdx))
      }

      return runs.join('')
    }

    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        i++
        continue
      }

      // Fenced Code Block
      if (trimmed.startsWith('```')) {
        i++
        const codeLines: string[] = []
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i])
          i++
        }
        if (i < lines.length) i++
        for (const cl of codeLines) {
          blocks.push(
            `    <w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/><w:spacing w:before="20" w:after="20" w:line="280" w:lineRule="auto"/><w:ind w:left="160" w:right="160"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Menlo" w:hAnsi="Menlo" w:eastAsia="PingFang SC"/><w:sz w:val="19"/><w:color w:val="0F766E"/></w:rPr><w:t xml:space="preserve">${escapeXml(cl || ' ')}</w:t></w:r></w:p>`
          )
        }
        continue
      }

      // Horizontal Rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        blocks.push(
          `    <w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D0D7DE"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`
        )
        i++
        continue
      }

      // Headings
      const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
      if (hMatch) {
        const lvl = hMatch[1].length
        const szMap: Record<number, number> = { 1: 44, 2: 34, 3: 28, 4: 25 }
        const sz = szMap[lvl] || 26
        const jc = lvl === 1 && opts.isFormal ? '<w:jc w:val="center"/>' : ''
        const bdr =
          lvl === 1
            ? `<w:pBdr><w:bottom w:val="single" w:sz="${opts.isFormal ? '12' : '6'}" w:space="6" w:color="${opts.isFormal ? 'C41E16' : 'E5E7EB'}"/></w:pBdr>`
            : ''
        blocks.push(
          `    <w:p><w:pPr>${jc}${bdr}<w:keepNext/><w:spacing w:before="${lvl === 1 ? '160' : '240'}" w:after="140"/></w:pPr>${renderInlineRuns(hMatch[2], `<w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:color w:val="111827"/>`)}</w:p>`
        )
        i++
        continue
      }

      // Markdown Table
      if (
        (trimmed.startsWith('|') && trimmed.endsWith('|')) ||
        (trimmed.includes('|') && i + 1 < lines.length && isTableDividerLine(lines[i + 1]))
      ) {
        const rows: string[][] = []
        while (i < lines.length) {
          const tl = lines[i].trim()
          if (!tl || !tl.includes('|')) break
          if (!isTableDividerLine(tl)) {
            const cells = tl
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((c) => c.trim())
            rows.push(cells)
          }
          i++
        }

        if (rows.length > 0) {
          const colCount = Math.max(...rows.map((r) => r.length))
          const colPct = Math.floor(5000 / Math.max(1, colCount))
          const trXml = rows
            .map((row, rIdx) => {
              const normalized = [...row]
              while (normalized.length < colCount) normalized.push('')
              const isHeader = rIdx === 0
              const tcXml = normalized
                .map((cell) => {
                  const shd = isHeader
                    ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F6F8"/>'
                    : ''
                  const cellRPr = isHeader
                    ? '<w:b/><w:bCs/><w:sz w:val="21"/><w:color w:val="111827"/>'
                    : '<w:sz w:val="21"/>'
                  return `<w:tc><w:tcPr><w:tcW w:w="${colPct}" w:type="pct"/>${shd}<w:tcMar><w:top w:w="110" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="280" w:lineRule="auto"/></w:pPr>${renderInlineRuns(cell, cellRPr)}</w:p></w:tc>`
                })
                .join('')
              return `<w:tr><w:trPr><w:cantSplit/>${isHeader ? '<w:tblHeader/>' : ''}</w:trPr>${tcXml}</w:tr>`
            })
            .join('')

          blocks.push(
            `    <w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="D0D5DD"/><w:left w:val="single" w:sz="6" w:space="0" w:color="D0D5DD"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="D0D5DD"/><w:right w:val="single" w:sz="6" w:space="0" w:color="D0D5DD"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D0D5DD"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D0D5DD"/></w:tblBorders></w:tblPr>${trXml}</w:tbl><w:p><w:pPr><w:spacing w:before="40" w:after="60"/></w:pPr></w:p>`
          )
        }
        continue
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const quoteText = trimmed.replace(/^>\s*/, '')
        const barColor = opts.isFormal ? 'C41E16' : '0071E3'
        blocks.push(
          `    <w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="${barColor}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/><w:ind w:left="280" w:right="140"/><w:spacing w:before="80" w:after="100"/></w:pPr>${renderInlineRuns(quoteText, '<w:color w:val="475467"/>')}</w:p>`
        )
        i++
        continue
      }

      // Unordered & Ordered Lists
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/)
      if (ulMatch) {
        const nested = ulMatch[1].length >= 2
        const left = nested ? 720 : 420
        const bullet = nested ? '◦  ' : '•  '
        blocks.push(
          `    <w:p><w:pPr><w:ind w:left="${left}" w:hanging="240"/><w:spacing w:before="30" w:after="60"/></w:pPr>${renderInlineRuns(bullet + ulMatch[2])}</w:p>`
        )
        i++
        continue
      }

      const olMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/)
      if (olMatch) {
        const nested = olMatch[1].length >= 2
        const left = nested ? 760 : 460
        blocks.push(
          `    <w:p><w:pPr><w:ind w:left="${left}" w:hanging="280"/><w:spacing w:before="30" w:after="60"/></w:pPr>${renderInlineRuns(`${olMatch[2]} ${olMatch[3]}`)}</w:p>`
        )
        i++
        continue
      }

      // Standard Paragraph
      const indentXml = opts.isFormal ? '<w:ind w:firstLine="480"/>' : ''
      blocks.push(
        `    <w:p><w:pPr>${indentXml}</w:pPr>${renderInlineRuns(trimmed)}</w:p>`
      )
      i++
    }

    if (blocks.length === 0) {
      blocks.push('    <w:p><w:r><w:t></w:t></w:r></w:p>')
    }

    return blocks.join('\n')
  }

  /**
   * Generates a vector A4 PDF buffer.
   * Primary: Electron's Chromium `BrowserWindow.webContents.printToPDF` for 100% print fidelity.
   * Fallback (non-Electron standalone Node server): Pure-Node `%PDF-1.4` CJK CIDFont (`STSong-Light` UTF-16BE) writer.
   */
  static async generatePdfBuffer(
    payload: {
      title: string
      markdown: string
      htmlBody: string
      preset: DocPresetType
    },
    BrowserWindowCtor?: typeof import('electron').BrowserWindow
  ): Promise<Buffer> {
    if (BrowserWindowCtor) {
      const html = this.buildStyledHtml(payload)
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const tmpHtml = path.join(os.tmpdir(), `claude_pdf_${id}.html`)
      let printWin: import('electron').BrowserWindow | null = null
      try {
        fs.writeFileSync(tmpHtml, html, 'utf-8')
        printWin = new BrowserWindowCtor({
          show: false,
          width: 860,
          height: 1180,
          webPreferences: {
            sandbox: true,
            contextIsolation: true
          }
        })
        await printWin.loadFile(tmpHtml)
        await new Promise((resolve) => setTimeout(resolve, 80))
        const pdfData = await printWin.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: {
            top: 0.55,
            bottom: 0.55,
            left: 0.6,
            right: 0.6
          }
        })
        return Buffer.from(pdfData)
      } finally {
        try {
          if (printWin && !printWin.isDestroyed()) {
            printWin.destroy()
          }
        } catch {
          // ignore
        }
        try {
          if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml)
        } catch {
          // ignore
        }
      }
    }

    return buildFallbackCjkPdfBuffer(payload.title, payload.markdown)
  }

  static async exportToBuffer(
    payload: ExportDocumentPayload,
    BrowserWindowCtor?: typeof import('electron').BrowserWindow
  ): Promise<{ buffer: Buffer; ext: DocExportFormat; mimeType: string }> {
    if (payload.format === 'pdf') {
      const buffer = await this.generatePdfBuffer(payload, BrowserWindowCtor)
      return { buffer, ext: 'pdf', mimeType: 'application/pdf' }
    }
    if (payload.format === 'docx') {
      const buffer = this.generateDocxBuffer(payload)
      return {
        buffer,
        ext: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    }
    const buffer = this.generateDocBuffer(payload)
    return { buffer, ext: 'doc', mimeType: 'application/msword' }
  }
}

// ============================================================================
// Pure-Node Zero-Dependency CRC32 & ZIP Archive Builder (for OOXML .docx)
// ============================================================================
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildZipArchive(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8')
    const uncompressed = entry.data
    const compressed = zlib.deflateRawSync(uncompressed, { level: 6 })
    const crc = computeCrc32(uncompressed)

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4) // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6) // UTF-8 flag
    localHeader.writeUInt16LE(8, 8) // compression method: deflate
    localHeader.writeUInt16LE(0x0000, 10) // mod time
    localHeader.writeUInt16LE(0x0021, 12) // mod date
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(uncompressed.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra len

    localChunks.push(localHeader, nameBuf, compressed)

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt16LE(0x0800, 8) // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10) // deflate
    centralHeader.writeUInt16LE(0x0000, 12)
    centralHeader.writeUInt16LE(0x0021, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(uncompressed.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralChunks.push(centralHeader, nameBuf)
    offset += localHeader.length + nameBuf.length + compressed.length
  }

  const centralDirBuf = Buffer.concat(centralChunks)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localChunks, centralDirBuf, eocd])
}

// ============================================================================
// Pure-Node CJK `%PDF-1.4` Fallback Writer (for non-Electron standalone server)
// ============================================================================
function toUtf16BeHex(text: string): string {
  const bytes: string[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes.push(code.toString(16).padStart(4, '0').toUpperCase())
  }
  return `<${bytes.join('')}>`
}

function buildFallbackCjkPdfBuffer(_title: string, markdown: string): Buffer {
  const rawLines = (markdown || '').replace(/\r\n/g, '\n').split('\n')
  const wrappedLines: Array<{ text: string; size: number }> = []

  for (const rl of rawLines) {
    const trimmed = rl.trim()
    if (!trimmed) {
      wrappedLines.push({ text: '', size: 11 })
      continue
    }
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    const fontSize = hMatch ? (hMatch[1].length === 1 ? 18 : hMatch[1].length === 2 ? 15 : 13) : 11
    const clean = (hMatch ? hMatch[2] : trimmed)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
    const maxChars = Math.floor(475 / fontSize)
    for (let p = 0; p < clean.length; p += maxChars) {
      wrappedLines.push({ text: clean.slice(p, p + maxChars), size: fontSize })
    }
  }

  // Paginate onto A4 (595 x 842 pt)
  const pages: Array<Array<{ text: string; size: number; y: number }>> = []
  let current: Array<{ text: string; size: number; y: number }> = []
  let y = 785
  for (const item of wrappedLines) {
    const step = Math.round(item.size * 1.65)
    if (y - step < 56) {
      pages.push(current)
      current = []
      y = 785
    }
    if (item.text) {
      current.push({ text: item.text, size: item.size, y })
    }
    y -= step
  }
  if (current.length > 0 || pages.length === 0) pages.push(current)

  // Object layout:
  // 1: Catalog, 2: Pages, 3: Type0 Font, 4: CIDFontType0 (STSong-Light), 5: FontDescriptor
  // Then for each page p: Page object + Contents stream object
  const objects: string[] = []
  const pageObjIds: number[] = []

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] =
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UTF16-H /DescendantFonts [4 0 R] >>'
  objects[4] =
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 5 0 R /DW 1000 >>'
  objects[5] =
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>'

  let nextId = 6
  for (const pageItems of pages) {
    const pageId = nextId++
    const contentId = nextId++
    pageObjIds.push(pageId)

    const ops = ['BT', '/F1 11 Tf', '0.12 0.14 0.16 rg']
    for (const ln of pageItems) {
      ops.push(`/F1 ${ln.size} Tf`)
      ops.push(`1 0 0 1 56 ${ln.y} Tm`)
      ops.push(`${toUtf16BeHex(ln.text)} Tj`)
    }
    ops.push('ET')
    const streamBody = ops.join('\n')

    objects[contentId] = `<< /Length ${Buffer.byteLength(streamBody, 'utf-8')} >>\nstream\n${streamBody}\nendstream`
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')]
  const offsets: number[] = [0]
  let bytePos = chunks[0].length

  for (let id = 1; id < nextId; id++) {
    offsets[id] = bytePos
    const objBuf = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'utf-8')
    chunks.push(objBuf)
    bytePos += objBuf.length
  }

  const xrefOffset = bytePos
  const xrefLines = [`xref`, `0 ${nextId}`, `0000000000 65535 f `]
  for (let id = 1; id < nextId; id++) {
    xrefLines.push(`${String(offsets[id]).padStart(10, '0')} 00000 n `)
  }
  xrefLines.push(
    `trailer`,
    `<< /Size ${nextId} /Root 1 0 R >>`,
    `startxref`,
    `${xrefOffset}`,
    `%%EOF\n`
  )
  chunks.push(Buffer.from(xrefLines.join('\n'), 'utf-8'))

  return Buffer.concat(chunks)
}
