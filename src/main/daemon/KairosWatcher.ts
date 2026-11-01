import { Notification } from 'electron'
import { KairosTriggerRule, StreamUpdatePayload } from '@shared/types'
import { ConfigStore } from '../store/ConfigStore'
import { ToolRegistry } from '../tools/ToolRegistry'

/**
 * Clean-room implementation of Claude Code's leaked "KAIROS" autonomous background daemon.
 * Manages proactive background checks, scheduled triggers, and system notifications.
 */
export class KairosWatcher {
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private configStore: ConfigStore,
    private toolRegistry: ToolRegistry,
    private emitUpdate: (payload: StreamUpdatePayload) => void
  ) {
    this.syncSchedules()
  }

  syncSchedules(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer)
    }
    this.timers.clear()

    const rules = this.configStore.getKairosRules()
    for (const rule of rules) {
      if (rule.enabled && rule.type === 'interval') {
        const minutes = Math.max(1, Number(rule.patternOrMinutes) || 30)
        const timer = setInterval(() => {
          this.executeRule(rule.id).catch(console.error)
        }, minutes * 60 * 1000)
        this.timers.set(rule.id, timer)
      }
    }
  }

  async executeRule(ruleId: string): Promise<KairosTriggerRule | null> {
    const rules = this.configStore.getKairosRules()
    const rule = rules.find((r) => r.id === ruleId)
    if (!rule) return null

    const cfg = this.configStore.getConfig()
    const bashTool = this.toolRegistry.getTool('run_bash')!

    const statusOut = await bashTool.execute(
      { command: 'git status -s 2>/dev/null || ls -la | head -n 12' },
      { workspaceDir: cfg.workspaceDir },
      `kairos_${Date.now()}`
    )

    const cleanSnippet = statusOut
      .split('\n')
      .slice(0, 6)
      .join(' | ')
      .slice(0, 220)

    rule.lastTriggeredAt = Date.now()
    rule.lastResult = `[${new Date().toLocaleTimeString()} 巡检完成] 指令: "${rule.promptInstruction.slice(0, 45)}..." -> 快照: ${cleanSnippet}`

    this.configStore.updateKairosRules(rules)

    const notifPayload = {
      title: `🛡️ KAIROS 守护巡检: ${rule.name}`,
      body: rule.lastResult,
      timestamp: Date.now()
    }

    this.emitUpdate({
      type: 'kairos_notification',
      notification: notifPayload
    })

    if (Notification.isSupported()) {
      new Notification({
        title: notifPayload.title,
        body: notifPayload.body
      }).show()
    }

    return rule
  }

  stopAll(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer)
    }
    this.timers.clear()
  }
}
