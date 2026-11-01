export interface OpenAIToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface OpenAIMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
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

export class OpenAICompatibleClient {
  /**
   * Streams chat completions from any OpenAI-compatible API endpoint
   * (DeepSeek, Qwen, SiliconFlow, OpenRouter, OpenAI, vLLM, Ollama).
   * Supports SSE streaming, reasoning_content extraction, and chunked tool_calls assembly.
   */
  async streamChatCompletion(params: {
    baseUrl: string
    apiKey: string
    model: string
    messages: OpenAIMessagePayload[]
    tools?: OpenAIToolSchema[]
    signal?: AbortSignal
    onDelta?: (delta: { content?: string; reasoning?: string }) => void
  }): Promise<StreamCompletionResult> {
    const cleanBase = params.baseUrl.replace(/\/+$/, '')
    const endpoint = cleanBase.endsWith('/chat/completions')
      ? cleanBase
      : `${cleanBase}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (params.apiKey && params.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${params.apiKey.trim()}`
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: params.signal
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`LLM API 请求失败 (${response.status}): ${errorText || response.statusText}`)
    }

    if (!response.body) {
      throw new Error('LLM API 响应缺少可读流 (ReadableStream)')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    let fullContent = ''
    let fullReasoning = ''
    const toolCallMap = new Map<
      number,
      { id: string; name: string; argumentsJson: string }
    >()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || !line.startsWith('data:')) continue

        const dataStr = line.slice(5).trim()
        if (dataStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(dataStr)
          const delta = parsed.choices?.[0]?.delta
          if (!delta) continue

          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
            fullReasoning += delta.reasoning_content
            params.onDelta?.({ reasoning: delta.reasoning_content })
          }

          if (typeof delta.content === 'string' && delta.content) {
            fullContent += delta.content
            params.onDelta?.({ content: delta.content })
          }

          if (Array.isArray(delta.tool_calls)) {
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
          // Ignore malformed SSE comment or partial JSON chunk
        }
      }
    }

    const assembledToolCalls = Array.from(toolCallMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val)
      .filter((tc) => tc.name.trim().length > 0)

    return {
      content: fullContent,
      reasoningContent: fullReasoning,
      toolCalls: assembledToolCalls
    }
  }
}
