/**
 * Real-time Sensitive Secret Redactor (敏感凭证流式脱敏管道)
 * 自动拦截并脱敏：
 * 1. ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY
 * 2. OpenAI, DeepSeek, Gemini, SiliconFlow API Keys (sk-...)
 * 3. HTTP Authorization Bearer Tokens
 * 4. GitHub Personal Access Tokens (ghp_..., github_pat_...)
 * 5. 私钥凭证 (BEGIN PRIVATE KEY)
 * 6. JSON 配置文件中的敏感字段 (apiKey, token, secret, ANTHROPIC_AUTH_TOKEN 等)
 */

export function maskSensitiveSecrets(text: string): string {
  if (!text || typeof text !== 'string') return text

  let sanitized = text

  // 1. Anthropic specific auth tokens & API keys in env/shell expressions
  sanitized = sanitized.replace(
    /(ANTHROPIC_AUTH_TOKEN\s*[:=]\s*["']?)(sk-ant-[a-zA-Z0-9_\-]+|[a-zA-Z0-9_\-\.]{15,})(["']?)/gi,
    '$1[REDACTED_ANTHROPIC_TOKEN]$3'
  )
  sanitized = sanitized.replace(
    /(ANTHROPIC_API_KEY\s*[:=]\s*["']?)(sk-ant-[a-zA-Z0-9_\-]+|[a-zA-Z0-9_\-\.]{15,})(["']?)/gi,
    '$1[REDACTED_ANTHROPIC_KEY]$3'
  )

  // 2. Anthropic Token formats (sk-ant-api..., sk-ant-...)
  sanitized = sanitized.replace(
    /sk-ant-(?:api\d{2}-)?[a-zA-Z0-9_\-]{20,}/g,
    (match) => `${match.slice(0, 10)}***[REDACTED_ANTHROPIC_TOKEN]***`
  )

  // 3. Common LLM Provider Environment Variables
  sanitized = sanitized.replace(
    /(OPENAI_API_KEY|DEEPSEEK_API_KEY|GEMINI_API_KEY|SILICONFLOW_API_KEY)(\s*[:=]\s*["']?)([^\s"'`,;]{12,})(["']?)/gi,
    '$1$2[REDACTED_API_KEY]$4'
  )

  // 4. OpenAI / Generic LLM API keys (sk-...)
  sanitized = sanitized.replace(
    /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    (match) => `${match.slice(0, 5)}***[REDACTED_API_KEY]***`
  )

  // 5. Authorization Bearer header
  sanitized = sanitized.replace(
    /((?:Authorization\s*:\s*Bearer|Bearer)\s+)[a-zA-Z0-9_\-\.]{15,}/gi,
    '$1[REDACTED_BEARER_TOKEN]'
  )

  // 6. GitHub Tokens
  sanitized = sanitized.replace(
    /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/g,
    '[REDACTED_GITHUB_TOKEN]'
  )

  // 7. Private Keys
  sanitized = sanitized.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  )

  // 8. JSON Config sensitive key properties (settings.json, config.json, etc.)
  sanitized = sanitized.replace(
    /("(?:apiKey|token|secret|password|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY)"\s*:\s*)"([^"]{8,})"/gi,
    (match, prefix, val) => {
      if (val.startsWith('[REDACTED')) return match
      return `${prefix}"[REDACTED_SECRET]"`
    }
  )

  return sanitized
}
