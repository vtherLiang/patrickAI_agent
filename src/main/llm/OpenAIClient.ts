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
    onDelta?: (delta: { content?: string; reasoning?: string; toolCalling?: boolean }) => void
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

    const doRequest = (payloadBody: Record<string, unknown>): Promise<StreamCompletionResult> => {
      return new Promise<StreamCompletionResult>((resolve, reject) => {
        let isSettled = false
        const safeReject = (err: Error): void => {
          if (!isSettled) {
            isSettled = true
            reject(err)
          }
        }
        const safeResolve = (res: StreamCompletionResult): void => {
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
            agent = new http.Agent({ keepAlive: true })
          }
        } else if (params.proxyMode === 'direct') {
          // Explicit direct connection avoiding proxy
          agent = isHttps ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true })
        }

        const requestOptions: https.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers,
          agent,
          timeout: 40000 // 40-second connection timeout
        }

        const clientModule = isHttps ? https : http
        const req = clientModule.request(requestOptions)

        let activeStream: NodeJS.ReadableStream | null = null
        let idleTimer: NodeJS.Timeout | null = null
        const resetWatchdog = (): void => {
          if (idleTimer) clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            req.destroy(new Error('LLM 流式传输中断 (超过 45 秒未收到新数据块，已自动停止)'))
          }, 45000)
        }

        const onAbort = (): void => {
          if (idleTimer) clearTimeout(idleTimer)
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
          req.destroy(new Error('LLM 接口连接超时 (超过 40 秒未建立连接)'))
        })

        req.on('error', (err) => {
          if (idleTimer) clearTimeout(idleTimer)
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

          // Multimodal fallback: if status 400/422 and multimodal images present
          const hasMultimodal = Array.isArray(payloadBody.messages) &&
            payloadBody.messages.some((m: any) => Array.isArray(m.content))

          if ((statusCode === 400 || statusCode === 422) && hasMultimodal) {
            if (idleTimer) clearTimeout(idleTimer)
            params.signal?.removeEventListener('abort', onAbort)
            res.resume() // discard response

            const flattenedMessages = (payloadBody.messages as OpenAIMessagePayload[]).map((m) => {
              if (!Array.isArray(m.content)) return m
              const textOnly = m.content
                .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map((part) => part.text)
                .join('\n\n')
              return { ...m, content: textOnly }
            })

            doRequest({ ...payloadBody, messages: flattenedMessages })
              .then(safeResolve)
              .catch(safeReject)
            return
          }

          if (statusCode >= 400) {
            let errorBody = ''
            const errDecoder = new StringDecoder('utf-8')
            res.on('data', (c) => (errorBody += typeof c === 'string' ? c : errDecoder.write(c)))
            res.on('end', () => {
              errorBody += errDecoder.end()
              if (idleTimer) clearTimeout(idleTimer)
              params.signal?.removeEventListener('abort', onAbort)
              let hint = ''
              if (statusCode === 403 && parsedUrl.hostname.includes('deepseek.com')) {
                hint = ' (提示: DeepSeek 官方检测到非大陆 IP 拦截 403，请将该服务商网络模式切换为「国内直连」或在 VPN 中将 deepseek.com 设置为直连)'
              } else if ((statusCode === 401 || statusCode === 403) && (parsedUrl.hostname.includes('openai.com') || parsedUrl.hostname.includes('googleapis.com'))) {
                hint = ' (提示: OpenAI / Gemini 在国内网络下受限，请确认已开启代理并设置为「走代理 / VPN」)'
              }
              safeReject(new Error(`LLM API 响应错误 (${statusCode}): ${errorBody || res.statusMessage || ''}${hint}`))
            })
            return
          }

          let stream: NodeJS.ReadableStream = res
          const encoding = (res.headers['content-encoding'] || '').toLowerCase()
          if (encoding === 'gzip') {
            stream = res.pipe(zlib.createGunzip())
          } else if (encoding === 'deflate') {
            stream = res.pipe(zlib.createInflate())
          }
          activeStream = stream

          res.on('close', () => {
            if (params.signal?.aborted) {
              const abortErr = new Error('The user aborted a request.')
              abortErr.name = 'AbortError'
              safeReject(abortErr)
            }
          })

          let buffer = ''
          let fullContent = ''
          let fullReasoning = ''
          const decoder = new StringDecoder('utf-8')
          const toolCallMap = new Map<
            number,
            { id: string; name: string; argumentsJson: string }
          >()

          resetWatchdog()

          const parseSseLines = (textLines: string[]): void => {
            for (const rawLine of textLines) {
              const line = rawLine.trim()
              if (!line || !line.startsWith('data:')) continue

              const dataStr = line.slice(5).trim()
              if (dataStr === '[DONE]') continue

              try {
                const parsed = JSON.parse(dataStr)
                const delta = parsed.choices?.[0]?.delta
                if (!delta) continue

                // Reasoning tokens: DeepSeek (reasoning_content), Kimi/OpenAI (reasoning), Gemini (thought)
                const reasoningText =
                  delta.reasoning_content || delta.reasoning || delta.thought || ''
                if (typeof reasoningText === 'string' && reasoningText) {
                  fullReasoning += reasoningText
                  params.onDelta?.({ reasoning: reasoningText })
                }

                if (typeof delta.content === 'string' && delta.content) {
                  fullContent += delta.content
                  params.onDelta?.({ content: delta.content })
                }

                if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
                  params.onDelta?.({ toolCalling: true })
                  for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === 'number' ? tc.index : 0
                    const existing = toolCallMap.get(idx) || {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      name: '',
                      argumentsJson: ''
                    }
                    if (tc.id) existing.id = tc.id
                    if (tc.function?.name) existing.name += tc.function.name
                    if (tc.function?.arguments) existing.argumentsJson += tc.function.arguments
                    toolCallMap.set(idx, existing)
                  }
                }
              } catch {
                // Ignore incomplete SSE chunk or heartbeat
              }
            }
          }

          stream.on('data', (chunk: Buffer | string) => {
            resetWatchdog()
            buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            parseSseLines(lines)
          })

          stream.on('end', () => {
            if (idleTimer) clearTimeout(idleTimer)
            params.signal?.removeEventListener('abort', onAbort)

            buffer += decoder.end()
            if (buffer.trim()) {
              parseSseLines(buffer.split('\n'))
              buffer = ''
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
            if (idleTimer) clearTimeout(idleTimer)
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
