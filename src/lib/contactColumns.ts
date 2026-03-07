import { supabase } from './supabase'

export interface CustomColumnDef {
  key: string
  label: string
}

export const MAX_CUSTOM_COLS = 5

export function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40) || 'field'
}

export function generateKey(label: string, existingKeys: string[]): string {
  const base = labelToKey(label)
  if (!existingKeys.includes(base)) return base
  let i = 2
  while (existingKeys.includes(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export async function getColumnDefs(userId: string): Promise<CustomColumnDef[]> {
  const { data } = await supabase
    .from('user_settings')
    .select('contact_columns')
    .eq('user_id', userId)
    .single()
  return (data?.contact_columns ?? []) as CustomColumnDef[]
}

export async function saveColumnDefs(userId: string, cols: CustomColumnDef[]): Promise<void> {
  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, contact_columns: cols }, { onConflict: 'user_id' })
}
