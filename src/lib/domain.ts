import type { CkDoc, Campaign, Lead, SentRow } from './types'

export const em = (l: { email?: string } | string) =>
  String(typeof l === 'string' ? l : l.email || '').trim().toLowerCase()

const FREE = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com',
  'aol.com', 'proton.me', 'protonmail.com', 'yahoo.in', 'rediffmail.com',
])

export const domainOf = (l: Lead): string => {
  const d = (l.domain || '').toLowerCase()
  if (d && !FREE.has(d)) return d
  const e = em(l).split('@')[1] || ''
  return e && !FREE.has(e) ? e : ''
}

export const score = (l: Lead) => parseFloat(l.persona_score) || 0

export const tier = (s: number): 'high' | 'medium' | 'low' => (s >= 9 ? 'high' : s >= 7 ? 'medium' : 'low')

const GULF = /uae|dubai|abu dhabi|sharjah|ajman|ras al|al ain|emirates|saudi|ksa|riyadh|jeddah|dammam|khobar|oman|muscat|qatar|doha|kuwait|bahrain|manama/i

export function campaignOf(l: Lead, doc: CkDoc): Campaign | undefined {
  const byId = (id?: string) => doc.campaigns.find((c) => c.id === id)
  const dom = domainOf(l)
  const direct = byId(doc.assign[em(l)]) || (dom ? byId(doc.assign['d:' + dom]) : undefined)
  if (direct) return direct
  return (GULF.test(l.location || '') && byId('c-gulf1')) || byId('c-core') || undefined
}

export interface Seq {
  step: 0 | 1 | 2 | 3
  stopped: boolean
  row?: SentRow
}

export function sequenceOf(l: Lead, sentByEmail: Map<string, SentRow>): Seq {
  const row = sentByEmail.get(em(l))
  if (!row) return { step: 0, stopped: false }
  const step = row.follow_up_2_sent ? 3 : row.follow_up_1_sent ? 2 : 1
  return { step, stopped: !!row.replied, row }
}

export const sentIndex = (sent: SentRow[]) => {
  const m = new Map<string, SentRow>()
  for (const r of sent) if (r.email) m.set(r.email.toLowerCase(), r)
  return m
}

export const queueOf = (leads: Lead[], sent: Map<string, SentRow>) =>
  leads
    .filter((l) => l.status === 'approved' && !sent.has(em(l)))
    .sort((a, b) => score(b) - score(a))

// ---- Office hours (mirrors the engine's sender node) ----
const SUN_THU = [0, 1, 2, 3, 4]
const MON_FRI = [1, 2, 3, 4, 5]
const PLACES: [RegExp, string, number[]][] = [
  [/\b(uae|dubai|abu dhabi|sharjah|ajman|emirates)\b/i, 'Asia/Dubai', MON_FRI],
  [/\b(ksa|saudi|riyadh|jeddah|dammam|khobar)\b/i, 'Asia/Riyadh', SUN_THU],
  [/\b(oman|muscat)\b/i, 'Asia/Muscat', SUN_THU],
  [/\b(qatar|doha)\b/i, 'Asia/Qatar', SUN_THU],
  [/\b(kuwait)\b/i, 'Asia/Kuwait', SUN_THU],
  [/\b(bahrain|manama)\b/i, 'Asia/Bahrain', SUN_THU],
  [/\b(egypt|cairo)\b/i, 'Africa/Cairo', SUN_THU],
  [/\b(ireland|dublin|cork)\b/i, 'Europe/Dublin', MON_FRI],
  [/\b(uk|united kingdom|england|scotland|wales|london|leeds|manchester)\b/i, 'Europe/London', MON_FRI],
  [/\b(india|ahmedabad|gurgaon|mumbai|delhi|bangalore|bengaluru|pune|chennai|hyderabad)\b/i, 'Asia/Kolkata', MON_FRI],
  [/\b(poland|warsaw)\b/i, 'Europe/Warsaw', MON_FRI],
  [/\b(germany|berlin|munich)\b/i, 'Europe/Berlin', MON_FRI],
  [/\b(netherlands|amsterdam|belgium|spain|portugal|italy|france|sweden|norway|denmark|czech|prague)\b/i, 'Europe/Paris', MON_FRI],
  [/\b(pakistan|karachi|lahore)\b/i, 'Asia/Karachi', MON_FRI],
  [/\b(south africa|cape town|johannesburg|durban|pretoria)\b/i, 'Africa/Johannesburg', MON_FRI],
  [/\b(singapore|malaysia|kuala lumpur)\b/i, 'Asia/Singapore', MON_FRI],
  [/\b(new zealand|nz|auckland|wellington|christchurch)\b/i, 'Pacific/Auckland', MON_FRI],
  [/\b(australia|sydney|melbourne|brisbane|nsw|qld)\b/i, 'Australia/Sydney', MON_FRI],
  [/\b(british columbia|vancouver|bc)\b/i, 'America/Vancouver', MON_FRI],
  [/\b(calgary|alberta|edmonton)\b/i, 'America/Edmonton', MON_FRI],
  [/\b(canada|toronto|ontario|ottawa|montreal)\b/i, 'America/Toronto', MON_FRI],
  [/\b(usa|us|united states|new york)\b/i, 'America/New_York', MON_FRI],
]

export function officeOpen(l: Lead, now = new Date()): boolean {
  const hit = PLACES.find(([re]) => re.test(l.location || ''))
  const tz = hit ? hit[1] : 'Asia/Dubai'
  const days = hit ? hit[2] : MON_FRI
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday') || '')
  const hour = parseInt(get('hour') || '0', 10)
  return days.includes(wd) && hour >= 9 && hour < 11
}

export const todayUtc = () => new Date().toISOString().slice(0, 10)

export function sendsByDay(sent: SentRow[], days = 14) {
  const out: { day: string; first: number; follow: number }[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    out.push({ day: new Date(now - i * 86_400_000).toISOString().slice(0, 10), first: 0, follow: 0 })
  }
  const idx = new Map(out.map((o) => [o.day, o]))
  for (const r of sent) {
    const a = idx.get(String(r.sent_date).slice(0, 10))
    if (a) a.first++
    const b = idx.get(String(r.follow_up_1_sent || '').slice(0, 10))
    if (b) b.follow++
    const c = idx.get(String(r.follow_up_2_sent || '').slice(0, 10))
    if (c) c.follow++
  }
  return out
}
