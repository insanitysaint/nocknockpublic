export type LeadStatus = 'new' | 'review' | 'approved' | 'sent' | 'rejected' | 'no_email' | 'bounced' | 'replied' | string

export interface Lead {
  lead_id: string
  email: string
  first_name: string
  company: string
  website: string
  domain: string
  location: string
  angle: string
  source: string
  persona_score: string
  status: LeadStatus
  added_date: string
  decision_date: string
  note: string
}

export interface SentRow {
  email: string
  company: string
  first_name: string
  sent_date: string
  follow_up_1_sent?: string
  follow_up_2_sent?: string
  replied?: string
  replied_date?: string
  location?: string
}

export interface DashState {
  leads: Lead[]
  sent: SentRow[]
  now: string
}

export interface Note {
  id: string
  ts: string
  text: string
  pinned: boolean
  edited?: string
}

export interface Campaign {
  id: string
  name: string
  status: 'active' | 'paused' | 'draft'
  account: string
  region: string
  color: string
  desc: string
  created: string
}

export interface Account {
  email: string
  label: string
  provider: string
  daily_limit: number
  inactive?: boolean
}

export interface CkDoc {
  rev: number
  updated: string | null
  notes: { global: Note[]; leads: Record<string, Note[]> }
  campaigns: Campaign[]
  assign: Record<string, string>
  uploads: UploadLog[]
  held: Record<string, string[]>
  stage: Record<string, string>
  accounts: Account[]
  settings: {
    goal_mrr: number
    goal_price: number
    copy_drafts: Record<string, { subject: string; body: string }>
  }
}

export interface UploadLog {
  ts: string
  source?: string
  campaign?: string
  rows?: number
  added?: number
  note?: string
}

export interface Reply {
  id: string
  from: string
  name: string
  subject: string
  date: string
  snippet: string
}

export interface CkState {
  doc: CkDoc
  replies: Reply[]
}

export type SendBody =
  | { mode: 'next'; n: number; cap?: number; force?: boolean; region?: string }
  | { mode: 'ids'; ids: string[]; cap?: number; force?: boolean }
  | { mode: 'due'; n: number; cap?: number; force?: boolean }
