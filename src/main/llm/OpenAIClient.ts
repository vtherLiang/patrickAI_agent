import http from 'http'
import https from 'https'
import tls from 'tls'
import url from 'url'
import zlib from 'zlib'
import { StringDecoder } from 'string_decoder'
import { ProxyMode, TestProviderResult } from '@shared/types'

export interface OpenAIToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type OpenAIMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }

export interface OpenAIMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | OpenAIMessageContentPart[] | null
  reasoning_content?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
  name?: string
}

const sharedDirectHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 })
const sharedDirectHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 })

export interface StreamCompletionResult {
  content: string
  reasoningContent: string
  toolCalls: Array<{
    id: string
    name: string
    argumentsJson: string
  }>
}

/**
 * Custom HTTPS Agent implementing HTTP CONNECT tunnel for proxying over VPN / local proxies
 * (Clash, Surge, Shadowrocket, Sing-Box, etc.).
 */
export class HttpConnectAgent extends https.Agent {
  private proxyUrl: url.URL

  constructor(proxyUrl: string, options?: https.AgentOptions) {
    super(options)
    this.proxyUrl = new url.URL(proxyUrl)
  }

  createConnection(options: any, callback: (err: Error | null, socket?: any) => void): any {
    const targetHost = options.host || options.hostname
    const targetPort = options.port || 443
    const proxyHost = this.proxyUrl.hostname
    const proxyPort = Number(this.proxyUrl.port) || 80

    const proxyReq = http.request({
      host: proxyHost,
      port: proxyPort,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: {
        Host: `${targetHost}:${targetPort}`
      }
    })

    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        const tlsSocket = tls.connect(
          {
            socket,
            servername: targetHost
          },
          () => {
            callback(null, tlsSocket)
          }
        )
        tlsSocket.on('error', (err) => callback(err))
      } else {
        callback(
          new Error(
            `代理连接失败 (CONNECT ${targetHost}:${targetPort} 状态码: ${res.statusCode} ${res.statusMessage || ''})`
          )
        )
      }
    })

    proxyReq.on('error', (err) => {
      callback(new Error(`无法连接至代理服务器 (${proxyHost}:${proxyPort}): ${err.message}`))
    })

    proxyReq.setTimeout(15000, () => {
      proxyReq.destroy(new Error(`连接本地代理服务器超时 (${proxyHost}:${proxyPort})`))
    })

    proxyReq.end()
    return null
  }
}

export function normalizeBaseUrl(url: string): string {
  let clean = (url || '').trim().replace(/\/+$/, '')
  if (!clean) return ''
  if (clean.endsWith('/chat/completions')) {
    return clean
  }
  try {
    const parsed = new URL(clean)
    // If user provided domain without path (e.g. https://www.micuapi.ai), auto-append /v1
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/v1'
      return parsed.toString().replace(/\/+$/, '')
    }
  } catch {
    // ignore
  }
  return clean
}

export function resolveProxyUrl(
  proxyMode?: ProxyMode,
  customProxyUrl?: string,
  globalProxyUrl?: string
): string | null {
  // 1. Direct mode: explicitly bypass any proxy or system VPN
  if (proxyMode === 'direct') {
    return null
  }

  // 2. System mode: strictly follow OS / system environment variables
  if (proxyMode === 'system') {
    return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null
  }

  // 3. Proxy mode: route through designated local proxy or tunnel
  if (proxyMode === 'proxy') {
    if (customProxyUrl && customProxyUrl.trim()) {
      return customProxyUrl.trim()
    }
    if (globalProxyUrl && globalProxyUrl.trim()) {
      return globalProxyUrl.trim()
    }
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY
    if (envProxy) return envProxy
    return 'http://127.0.0.1:7890'
  }

  return null
}

export class OpenAICompatibleClient {
  /**
   * Streams chat completions from any OpenAI-compatible API endpoint
   * (DeepSeek, OpenAI, Google Gemini, OneAPI / NewAPI 中转站, SiliconFlow, OpenRouter, Ollama).
   * Supports:
   * - Custom proxy routing per provider (Direct bypass for DeepSeek vs Proxy for OpenAI/Gemini)
   * - SSE streaming with reasoning_content / reasoning / thought extraction
   * - Multimodal image_url fallback
   * - Chunked tool_calls assembly
   * - Idle chunk watchdog
   */
  async streamChatCompletion(params: {
    baseUrl: string
    apiKey: string
    model: string
    messages: OpenAIMessagePayload[]
    tools?: OpenAIToolSchema[]
    signal?: AbortSignal
    proxyMode?: ProxyMode
    proxyUrl?: string
    globalProxyUrl?: string
    customHeaders?: Record<string, string>
    onDelta?: (delta: {
      content?: string
      reasoning?: string
      toolCalling?: boolean
      toolArgsDelta?: string
      usageCompletionTokens?: number
    }) => void
  }): Promise<StreamCompletionResult> {
    const cleanBase = normalizeBaseUrl(params.baseUrl)
    const endpoint = cleanBase.endsWith('/chat/completions')
      ? cleanBase
      : `${cleanBase}/chat/completions`

    const parsedUrl = new url.URL(endpoint)
    const isHttps = parsedUrl.protocol === 'https:'

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Accept-Encoding': 'gzip, deflate, identity',
      ...(params.customHeaders || {})
    }

    if (params.apiKey && params.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${params.apiKey.trim()}`
      // Google Gemini official OpenAI-compatible endpoint accepts both Bearer and x-goog-api-key
      if (parsedUrl.hostname.includes('googleapis.com')) {
        headers['x-goog-api-key'] = params.apiKey.trim()
      }
    }

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages,
      stream: true,
      temperature: 0.2
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools
      body.tool_choice = 'auto'
    }

    const effectiveProxy = resolveProxyUrl(params.proxyMode, params.proxyUrl, params.globalProxyUrl)

    const doRequest = (
      payloadBody: Record<string, unknown>,
      retryState: { multimodal: boolean; noTemp: boolean; noReasoning: boolean } = {
        multimodal: false,
        noTemp: false,
        noReasoning: false
      }
    ): Promise<StreamCompletionResult> => {
      return new Promise<StreamCompletionResult>((resolve, reject) => {
        let isSettled = false
        let activeStream: NodeJS.ReadableStream | null = null
        let idleTimer: NodeJS.Timeout | null = null
        let progressTimer: NodeJS.Timeout | null = null

        const clearWatchdogs = (): void => {
          if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
          }
          if (progressTimer) {
            clearTimeout(progressTimer)
            progressTimer = null
          }
        }

        const safeReject = (err: Error): void => {
          clearWatchdogs()
          if (!isSettled) {
            isSettled = true
            reject(err)
          }
        }
        const safeResolve = (res: StreamCompletionResult): void => {
          clearWatchdogs()
          if (!isSettled) {
            isSettled = true
            resolve(res)
          }
        }

        if (params.signal?.aborted) {
          const abortErr = new Error('The user aborted a request.')
          abortErr.name = 'AbortError'
          safeReject(abortErr)
          return
        }

        let agent: http.Agent | https.Agent | undefined = undefined
        if (effectiveProxy) {
          if (isHttps) {
            agent = new HttpConnectAgent(effectiveProxy, { keepAlive: true })
          } else {
            agent = sharedDirectHttpAgent
          }
        } else if (params.proxyMode === 'direct') {
          // Explicit direct connection avoiding proxy (reuse pooled keep-alive agent)
          agent = isHttps ? sharedDirectHttpsAgent : sharedDirectHttpAgent
        }

        const requestOptions: https.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers,
          agent,
          timeout: 45000 // 45-second connection / header timeout
        }

        const clientModule = isHttps ? https : http
        const req = clientModule.request(requestOptions)

        const resetIdleWatchdog = (): void => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            req.destroy(new Error('LLM 流式传输中断 (超过 45 秒未收到新数据块，已自动停止)'))
          }, 45000)
        }

        const resetProgressWatchdog = (): void => {
          if (progressTimer) clearTimeout(progressTimer)
          progressTimer = setTimeout(() => {
            req.destroy(
              new Error(
                'LLM 流式响应卡滞 (超过 75 秒仅收到心跳/空数据包，未产生任何思考或正文输出，已自动停止)'
              )
            )
          }, 75000)
        }

        const onAbort = (): void => {
          clearWatchdogs()
          params.signal?.removeEventListener('abort', onAbort)
          const abortErr = new Error('The user aborted a request.')
          abortErr.name = 'AbortError'
          if (activeStream) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(activeStream as any).destroy?.(abortErr)
            } catch {}
          }
          try {
            req.destroy(abortErr)
          } catch {}
          safeReject(abortErr)
        }
        params.signal?.addEventListener('abort', onAbort)

        req.on('timeout', () => {
          req.destroy(new Error('LLM 接口连接超时 (超过 45 秒未建立连接)'))
        })

        req.on('error', (err) => {
          clearWatchdogs()
          params.signal?.removeEventListener('abort', onAbort)
          if (params.signal?.aborted || err.name === 'AbortError' || err.message?.includes('abort')) {
            const abortErr = new Error('The user aborted a request.')
            abortErr.name = 'AbortError'
            safeReject(abortErr)
            return
          }
          safeReject(new Error(`LLM 网络请求失败: ${err.message}`))
        })

        req.on('response', (res) => {
          const statusCode = res.statusCode || 0
          const encoding = (res.headers['content-encoding'] || '').toLowerCase()
          const decodeStream = (src: NodeJS.ReadableStream): NodeJS.ReadableStream => {
            if (encoding === 'gzip') return src.pipe(zlib.createGunzip())
            if (encoding === 'deflate') return src.pipe(zlib.createInflate())
            return src
          }

          if (statusCode >= 400) {
            const errStream = decodeStream(res)
            let errorBody = ''
            const errDecoder = new StringDecoder('utf-8')
            errStream.on('data', (c) => {
              errorBody += typeof c === 'string' ? c : errDecoder.write(c)
            })
            errStream.on('error', () => {
              params.signal?.removeEventListener('abort', onAbort)
              safeReject(new Error(`LLM API 响应错误 (${statusCode}): ${res.statusMessage || ''}`))
            })
            errStream.on('end', () => {
              errorBody += errDecoder.end()
              clearWatchdogs()
              params.signal?.removeEventListener('abort', onAbort)

              if (statusCode === 400 || statusCode === 422) {
                const hasMultimodal =
                  Array.isArray(payloadBody.messages) &&
                  payloadBody.messages.some((m: any) => Array.isArray(m.content))
                const hasReasoningField =
                  Array.isArray(payloadBody.messages) &&
                  payloadBody.messages.some((m: any) => m.reasoning_content !== undefined)

                if (
                  !retryState.noTemp &&
                  payloadBody.temperature !== undefined &&
                  /temperature/i.test(errorBody)
                ) {
                  const nextBody = { ...payloadBody }
                  delete nextBody.temperature
                  doRequest(nextBody, { ...retryState, noTemp: true })
                    .then(safeResolve)
                    .catch(safeReject)
                  return
                }

                if (
                  !retryState.noReasoning &&
                  hasReasoningField &&
                  /reasoning_content/i.test(errorBody)
                ) {
                  const strippedMessages = (payloadBody.messages as OpenAIMessagePayload[]).map((m) => {
                    if (m.reasoning_content === undefined) return m
                    const { reasoning_content: _rc, ...rest } = m
                    return rest
                  })
                  doRequest(
                    { ...payloadBody, messages: strippedMessages },
                    { ...retryState, noReasoning: true }
                  )
                    .then(safeResolve)
                    .catch(safeReject)
                  return
                }

                if (!retryState.multimodal && hasMultimodal) {
                  const flattenedMessages = (payloadBody.messages as OpenAIMessagePayload[]).map(
                    (m) => {
                      if (!Array.isArray(m.content)) return m
                      const textOnly = m.content
                        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                        .map((part) => part.text)
                        .join('\n\n')
                      return { ...m, content: textOnly }
                    }
                  )
                  doRequest(
                    { ...payloadBody, messages: flattenedMessages },
                    { ...retryState, multimodal: true }
                  )
                    .then(safeResolve)
                    .catch(safeReject)
                  return
                }
              }

              let hint = ''
              if (statusCode === 403 && parsedUrl.hostname.includes('deepseek.com')) {
                hint =
                  ' (提示: DeepSeek 官方检测到非大陆 IP 拦截 403，请将该服务商网络模式切换为「国内直连」或在 VPN 中将 deepseek.com 设置为直连)'
              } else if (
                (statusCode === 401 || statusCode === 403) &&
                (parsedUrl.hostname.includes('openai.com') ||
                  parsedUrl.hostname.includes('googleapis.com'))
              ) {
                hint = ' (提示: OpenAI / Gemini 在国内网络下受限，请确认已开启代理并设置为「走代理 / VPN」)'
              }
              safeReject(
                new Error(`LLM API 响应错误 (${statusCode}): ${errorBody || res.statusMessage || ''}${hint}`)
              )
            })
            return
          }

          const stream = decodeStream(res)
          activeStream = stream

          let buffer = ''
          let fullContent = ''
          let fullReasoning = ''
          let thinkPhase: 'pending' | 'in_think' | 'normal' = 'pending'
          let thinkProbeBuf = ''
          let thinkCloseBuf = ''
          let sawSseDataLine = false
          let sawDoneOrFinish = false
          let streamEnded = false
          let nonSseRawBody = ''
          const decoder = new StringDecoder('utf-8')
          const toolCallMap = new Map<
            number,
            { id: string; name: string; argumentsJson: string }
          >()

          const emitReasoning = (text: string): void => {
            if (!text) return
            resetProgressWatchdog()
            fullReasoning += text
            params.onDelta?.({ reasoning: text })
          }

          const emitContent = (text: string): void => {
            if (!text) return
            resetProgressWatchdog()
            fullContent += text
            params.onDelta?.({ content: text })
          }

          const feedThinkBuffer = (chunkText: string): void => {
            thinkCloseBuf += chunkText
            const closeIdx = thinkCloseBuf.indexOf('</think>')
            if (closeIdx !== -1) {
              const thoughtPart = thinkCloseBuf.slice(0, closeIdx)
              const afterPart = thinkCloseBuf.slice(closeIdx + 8).replace(/^\n+/, '')
              thinkCloseBuf = ''
              thinkPhase = 'normal'
              emitReasoning(thoughtPart)
              emitContent(afterPart)
              return
            }
            // Hold up to 7 chars in case `</think>` is split across SSE chunks
            if (thinkCloseBuf.length > 7) {
              const safeLen = thinkCloseBuf.length - 7
              const safePart = thinkCloseBuf.slice(0, safeLen)
              thinkCloseBuf = thinkCloseBuf.slice(safeLen)
              emitReasoning(safePart)
            }
          }

          const handleContentPiece = (piece: string): void => {
            if (!piece) return
            if (fullReasoning.length > 0 && thinkPhase === 'pending') {
              // Dedicated reasoning field already active; bypass `<think>` probing
              thinkPhase = 'normal'
            }
            if (thinkPhase === 'normal') {
              emitContent(piece)
              return
            }
            if (thinkPhase === 'in_think') {
              feedThinkBuffer(piece)
              return
            }
            thinkProbeBuf += piece
            const trimmedStart = thinkProbeBuf.trimStart()
            if (!trimmedStart) return
            if (trimmedStart.startsWith('<think>')) {
              const afterOpen = trimmedStart.slice(7).replace(/^\n+/, '')
              thinkProbeBuf = ''
              thinkPhase = 'in_think'
              if (afterOpen) feedThinkBuffer(afterOpen)
              return
            }
            if ('<think>'.startsWith(trimmedStart)) {
              return
            }
            const flushed = thinkProbeBuf
            thinkProbeBuf = ''
            thinkPhase = 'normal'
            emitContent(flushed)
          }

          const extractReasoningString = (val: unknown): string => {
            if (!val) return ''
            if (typeof val === 'string') return val
            if (Array.isArray(val)) {
              return val.map(extractReasoningString).filter(Boolean).join('')
            }
            if (typeof val === 'object') {
              const obj = val as Record<string, unknown>
              if (typeof obj.thinking === 'string') return obj.thinking
              if (typeof obj.text === 'string') return obj.text
              if (typeof obj.summary === 'string') return obj.summary
              if (typeof obj.content === 'string') return obj.content
            }
            return ''
          }

          const applyToolCallsArray = (toolCallsArr: any[]): void => {
            if (!Array.isArray(toolCallsArr) || toolCallsArr.length === 0) return
            resetProgressWatchdog()
            let argsDelta = ''
            for (const tc of toolCallsArr) {
              const idx = typeof tc.index === 'number' ? tc.index : 0
              const existing = toolCallMap.get(idx) || {
                id: tc.id || `call_${Date.now()}_${idx}`,
                name: '',
                argumentsJson: ''
              }
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) {
                existing.name += tc.function.name
                argsDelta += tc.function.name
              } else if (typeof tc.name === 'string' && !existing.name) {
                existing.name += tc.name
                argsDelta += tc.name
              }
              if (tc.function?.arguments) {
                existing.argumentsJson += tc.function.arguments
                argsDelta += tc.function.arguments
              } else if (typeof tc.arguments === 'string') {
                existing.argumentsJson += tc.arguments
                argsDelta += tc.arguments
              }
              toolCallMap.set(idx, existing)
            }
            params.onDelta?.({ toolCalling: true, toolArgsDelta: argsDelta || undefined })
          }

          const applyMessageObject = (msgObj: any): void => {
            if (!msgObj || typeof msgObj !== 'object') return

            const reasoningCandidates = [
              msgObj.reasoning_content,
              msgObj.reasoning,
              msgObj.thought,
              msgObj.thinking,
              msgObj.reasoning_details,
              msgObj.extra_content?.google?.thought
            ]
            for (const cand of reasoningCandidates) {
              const rText = extractReasoningString(cand)
              if (rText) emitReasoning(rText)
            }

            if (typeof msgObj.content === 'string' && msgObj.content) {
              handleContentPiece(msgObj.content)
            } else if (Array.isArray(msgObj.content)) {
              for (const part of msgObj.content) {
                if (part && typeof part === 'object') {
                  if (
                    (part.type === 'thinking' || part.type === 'reasoning') &&
                    (typeof part.thinking === 'string' || typeof part.text === 'string')
                  ) {
                    emitReasoning(part.thinking || part.text)
                  } else if (typeof part.text === 'string' && part.text) {
                    handleContentPiece(part.text)
                  }
                }
              }
            } else if (typeof msgObj.text === 'string' && msgObj.text) {
              handleContentPiece(msgObj.text)
            }

            if (Array.isArray(msgObj.tool_calls) && msgObj.tool_calls.length > 0) {
              applyToolCallsArray(msgObj.tool_calls)
            }
          }

          const applyParsedPayload = (parsed: any): boolean => {
            if (!parsed || typeof parsed !== 'object') return true

            // Detect inline error objects returned over HTTP 200 (common on OneAPI / NewAPI relays)
            if (parsed.error) {
              const errMsg =
                typeof parsed.error === 'string'
                  ? parsed.error
                  : parsed.error.message || JSON.stringify(parsed.error)
              req.destroy()
              safeReject(new Error(`LLM API 返回错误: ${errMsg}`))
              return false
            }

            const usageTokens =
              typeof parsed.usage?.completion_tokens === 'number'
                ? parsed.usage.completion_tokens
                : typeof parsed.usage?.output_tokens === 'number'
                  ? parsed.usage.output_tokens
                  : undefined
            if (usageTokens !== undefined) {
              params.onDelta?.({ usageCompletionTokens: usageTokens })
            }

            // Standard OpenAI Chat Completions delta or full message
            const choice0 = parsed.choices?.[0]
            if (choice0) {
              if (choice0.finish_reason) {
                sawDoneOrFinish = true
                resetProgressWatchdog()
              }
              if (choice0.delta) {
                applyMessageObject(choice0.delta)
              } else if (choice0.message) {
                applyMessageObject(choice0.message)
              } else if (typeof choice0.text === 'string' && choice0.text) {
                handleContentPiece(choice0.text)
              }
              return true
            }

            // OpenAI Responses API SSE event compatibility (for GPT-5 / o3 relays)
            if (typeof parsed.type === 'string') {
              if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
                handleContentPiece(parsed.delta)
              } else if (
                (parsed.type === 'response.reasoning_summary_text.delta' ||
                  parsed.type === 'response.reasoning_text.delta' ||
                  parsed.type === 'response.thinking.delta') &&
                typeof (parsed.delta ?? parsed.text) === 'string'
              ) {
                emitReasoning(parsed.delta ?? parsed.text)
              } else if (parsed.type === 'response.completed') {
                sawDoneOrFinish = true
                resetProgressWatchdog()
                if (parsed.response?.output && !fullContent && !fullReasoning) {
                  applyResponsesOutputArray(parsed.response.output)
                }
              }
              return true
            }

            // Non-SSE Responses API full object fallback
            if (typeof parsed.output_text === 'string' && parsed.output_text) {
              handleContentPiece(parsed.output_text)
            } else if (Array.isArray(parsed.output)) {
              applyResponsesOutputArray(parsed.output)
            }
            return true
          }

          const applyResponsesOutputArray = (outputs: any[]): void => {
            for (const item of outputs) {
              if (!item || typeof item !== 'object') continue
              if (item.type === 'reasoning') {
                const rText = extractReasoningString(item.summary || item.content || item.text)
                if (rText) emitReasoning(rText)
              } else if (item.type === 'message' && Array.isArray(item.content)) {
                for (const part of item.content) {
                  if (part?.type === 'output_text' && typeof part.text === 'string') {
                    handleContentPiece(part.text)
                  } else if (typeof part?.text === 'string') {
                    handleContentPiece(part.text)
                  }
                }
              } else if (item.type === 'function_call' && item.name) {
                applyToolCallsArray([item])
              }
            }
          }

          resetIdleWatchdog()
          resetProgressWatchdog()

          res.on('close', () => {
            if (params.signal?.aborted) {
              const abortErr = new Error('The user aborted a request.')
              abortErr.name = 'AbortError'
              safeReject(abortErr)
              return
            }
            if (
              !streamEnded &&
              !isSettled &&
              !sawDoneOrFinish &&
              !fullContent &&
              !fullReasoning &&
              toolCallMap.size === 0
            ) {
              safeReject(new Error('LLM 数据流意外中断（服务端提前关闭连接且未返回任何内容）'))
            }
          })

          const parseSseLines = (textLines: string[]): void => {
            for (const rawLine of textLines) {
              const line = rawLine.trim()
              if (!line) continue
              if (!line.startsWith('data:')) {
                if (!sawSseDataLine && nonSseRawBody.length < 2 * 1024 * 1024) {
                  nonSseRawBody += rawLine + '\n'
                }
                continue
              }

              sawSseDataLine = true
              const dataStr = line.slice(5).trim()
              if (dataStr === '[DONE]') {
                sawDoneOrFinish = true
                continue
              }

              try {
                const parsed = JSON.parse(dataStr)
                if (!applyParsedPayload(parsed)) return
              } catch {
                // Ignore incomplete SSE chunk or heartbeat
              }
            }
          }

          stream.on('data', (chunk: Buffer | string) => {
            resetIdleWatchdog()
            buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            parseSseLines(lines)
          })

          stream.on('end', () => {
            streamEnded = true
            clearWatchdogs()
            params.signal?.removeEventListener('abort', onAbort)

            buffer += decoder.end()
            if (buffer.trim()) {
              parseSseLines(buffer.split('\n'))
              buffer = ''
            }

            // Fallback: handle providers that ignore `stream: true` and return plain JSON
            if (!sawSseDataLine && nonSseRawBody.trim().startsWith('{')) {
              try {
                const parsedJson = JSON.parse(nonSseRawBody.trim())
                if (!applyParsedPayload(parsedJson)) return
              } catch {
                // ignore malformed non-SSE payload
              }
            }

            if (thinkProbeBuf) {
              const rem = thinkProbeBuf
              thinkProbeBuf = ''
              thinkPhase = 'normal'
              emitContent(rem)
            }
            if (thinkCloseBuf) {
              const rem = thinkCloseBuf
              thinkCloseBuf = ''
              emitReasoning(rem)
            }

            const assembledToolCalls = Array.from(toolCallMap.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, val]) => val)
              .filter((tc) => tc.name.trim().length > 0)

            safeResolve({
              content: fullContent,
              reasoningContent: fullReasoning,
              toolCalls: assembledToolCalls
            })
          })

          stream.on('error', (err) => {
            clearWatchdogs()
            params.signal?.removeEventListener('abort', onAbort)
            if (params.signal?.aborted || err.name === 'AbortError' || err.message?.includes('abort')) {
              const abortErr = new Error('The user aborted a request.')
              abortErr.name = 'AbortError'
              safeReject(abortErr)
              return
            }
            safeReject(new Error(`LLM 数据流解析异常: ${err.message}`))
          })
        })

        req.write(JSON.stringify(payloadBody))
        req.end()
      })
    }

    return doRequest(body)
  }

  /**
   * Tests provider endpoint connection and measures latency (Ping in ms).
   */
  async testConnection(params: {
    baseUrl: string
    apiKey: string
    model?: string
    proxyMode?: ProxyMode
    customProxyUrl?: string
    globalProxyUrl?: string
    customHeaders?: Record<string, string>
  }): Promise<TestProviderResult> {
    const startTime = Date.now()
    try {
      const cleanBase = normalizeBaseUrl(params.baseUrl)
      const testModel = params.model || 'deepseek-chat'
      const testTimeoutController = new AbortController()
      const timer = setTimeout(() => testTimeoutController.abort(), 12000)

      try {
        await this.streamChatCompletion({
          baseUrl: cleanBase,
          apiKey: params.apiKey,
          model: testModel,
          messages: [{ role: 'user', content: 'ping' }],
          signal: testTimeoutController.signal,
          proxyMode: params.proxyMode,
          proxyUrl: params.customProxyUrl,
          globalProxyUrl: params.globalProxyUrl,
          customHeaders: params.customHeaders
        })
      } finally {
        clearTimeout(timer)
      }

      const latency = Date.now() - startTime
      return {
        ok: true,
        latencyMs: latency
      }
    } catch (err: any) {
      return {
        ok: false,
        latencyMs: Date.now() - startTime,
        error: err.message || String(err)
      }
    }
  }
}
