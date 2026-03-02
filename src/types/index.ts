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
