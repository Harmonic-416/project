import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Feedback about the site (migration 0020): anyone may send it, signed in or
 * not, and only the team reads it (in the Supabase dashboard). There is no
 * select policy, so the insert asks for nothing back.
 */

export const FEEDBACK_AREAS = ['home', 'vocal', 'guitar', 'social', 'other'] as const
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number]

export const MAX_MESSAGE = 4000
export const MAX_CONTACT = 200

export interface FeedbackInput {
  area?: string | null
  rating?: number | null
  message: string
  contact?: string | null
  page?: string | null
  userAgent?: string | null
}

export interface FeedbackRow {
  area: FeedbackArea
  rating: number | null
  message: string
  contact: string | null
  page: string | null
  user_agent: string | null
}

const clip = (text: string | null | undefined, max: number) => {
  const value = (text ?? '').trim()
  return value ? value.slice(0, max) : null
}

/**
 * Pure: the row to insert, trimmed and within the table's limits. Throws on
 * an empty or too-long message, a rating outside 1–5 or a contact that isn't
 * an email address; an unknown area becomes 'other'.
 */
export function feedbackRow(input: FeedbackInput): FeedbackRow {
  const message = (input.message ?? '').trim()
  if (!message) throw new Error('Write a few words first.')
  if (message.length > MAX_MESSAGE) throw new Error(`Please keep it under ${MAX_MESSAGE} characters.`)
  const rating = input.rating ?? null
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    throw new Error('A rating is 1 to 5 stars.')
  }
  const contact = clip(input.contact, MAX_CONTACT)
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new Error('That email address doesn’t look right.')
  const area = (FEEDBACK_AREAS as readonly string[]).includes(input.area ?? '') ? (input.area as FeedbackArea) : 'other'
  return { area, rating, message, contact, page: clip(input.page, 200), user_agent: clip(input.userAgent, 400) }
}

/** Send feedback as whoever is signed in (or no one). */
export async function sendFeedback(supabase: SupabaseClient, input: FeedbackInput): Promise<void> {
  const row = feedbackRow(input)
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id ?? null
  const { error } = await supabase.from('site_feedback').insert({ ...row, user_id: userId })
  if (error) throw error
}
