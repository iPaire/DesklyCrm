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

export function getColumnDefs(userId: string): CustomColumnDef[] {
  try {
    return JSON.parse(localStorage.getItem(`deskly_contact_cols_${userId}`) ?? '[]')
  } catch {
    return []
  }
}

export function saveColumnDefs(userId: string, cols: CustomColumnDef[]) {
  localStorage.setItem(`deskly_contact_cols_${userId}`, JSON.stringify(cols))
}
