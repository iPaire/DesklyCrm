import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useBillingStore } from '../store/billingStore'
import { AUTOMATION_DEFS, isEnabled } from '../lib/automations'
import type { Automation, AutomationType } from '../types'

// ── Custom toggle switch ───────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 left-0 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void
}

export function AutomationsPanel({ onToast }: Props) {
  const team    = useBillingStore(s => s.team)
  const isOwner = useBillingStore(s => s.isOwner)
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading]         = useState(true)
  const [toggling, setToggling]       = useState<AutomationType | null>(null)

  useEffect(() => {
    if (!team) return
    loadAutomations()
  }, [team])

  const loadAutomations = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('automations')
      .select('*')
      .eq('team_id', team!.id)
    setAutomations((data ?? []) as Automation[])
    setLoading(false)
  }

  const handleToggle = async (type: AutomationType) => {
    if (!team || !isOwner || toggling) return
    setToggling(type)

    const current = automations.find(a => a.automation_type === type)
    const newEnabled = !(current?.enabled ?? false)

    // Optimistic update
    if (current) {
      setAutomations(prev =>
        prev.map(a => a.automation_type === type ? { ...a, enabled: newEnabled } : a)
      )
    } else {
      setAutomations(prev => [...prev, {
        id: 'temp',
        user_id: null,
        team_id: team.id,
        automation_type: type,
        enabled: newEnabled,
        config: {},
        created_at: new Date().toISOString(),
      } as unknown as Automation])
    }

    const { error } = await supabase
      .from('automations')
      .upsert(
        { team_id: team.id, automation_type: type, enabled: newEnabled },
        { onConflict: 'team_id,automation_type' },
      )

    if (error) {
      await loadAutomations()
      onToast('Failed to save automation setting.', 'error')
    }

    setToggling(null)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-full" />
            </div>
            <div className="w-10 h-5 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800 -my-1">
      {!isOwner && (
        <p className="text-xs text-gray-500 dark:text-gray-400 pb-3">
          Automation settings are managed by the team owner.
        </p>
      )}
      {AUTOMATION_DEFS.map(def => {
        const enabled = isEnabled(automations, def.type)
        const isBusy  = toggling === def.type

        return (
          <div key={def.type} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
            {/* Icon */}
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-base shrink-0 mt-0.5">
              {def.icon}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                {def.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {def.actionDetail}
              </p>
              <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                enabled
                  ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/50'
                  : 'text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
              }`}>
                {enabled ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Enabled
                  </>
                ) : 'Disabled'}
              </span>
            </div>

            {/* Toggle */}
            <div className="shrink-0 mt-0.5">
              {isBusy ? (
                <div className="w-10 h-5 flex items-center justify-center">
                  <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <Toggle
                  checked={enabled}
                  onChange={() => handleToggle(def.type)}
                  disabled={!!toggling || !isOwner}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
