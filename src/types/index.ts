export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
}

export interface Contact {
  id: string
  user_id: string
  name: string
  email?: string
  phone?: string
  company?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Deal {
  id: string
  user_id: string
  contact_id?: string
  name: string
  value: number
  stage: 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost'
  archived: boolean
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  contact_id?: string
  deal_id?: string
  title: string
  due_date?: string
  completed: boolean
  created_at: string
  updated_at: string
}

export type AutomationType =
  | 'deal_proposal_task'
  | 'deal_stale_alert'
  | 'email_followup_task'
  | 'task_overdue_alert'
  | 'deal_auto_archive'
  | 'contact_reach_out_task'

export interface Automation {
  id: string
  user_id: string
  automation_type: AutomationType
  enabled: boolean
  config: Record<string, unknown>
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body?: string
  link_to?: string
  read: boolean
  created_at: string
}

export interface GmailConnection {
  id: string
  user_id: string
  gmail_email: string
  refresh_token: string
  access_token?: string
  token_expiry?: string
  connected_at: string
  last_sync?: string
}

export interface ActivityLog {
  id: string
  user_id: string
  contact_id: string
  type: 'call' | 'meeting' | 'note' | 'email'
  content: string
  created_at: string
}

export interface EmailLog {
  id: string
  user_id: string
  contact_id?: string
  gmail_message_id: string
  thread_id?: string
  subject?: string
  from_email?: string
  to_email?: string
  body_preview?: string
  body_full?: string
  received_at?: string
  direction: 'sent' | 'received'
  created_at: string
}
