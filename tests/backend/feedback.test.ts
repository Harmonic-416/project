import { describe, expect, it } from 'vitest'
import { feedbackRow, sendFeedback } from '../../src/lib/feedback'
import { hasSupabaseEnv, newClient, newTestUser } from '../helpers'

describe('site feedback, the row (pure)', () => {
  it('trims the message, keeps a known area and drops empty extras', () => {
    expect(feedbackRow({ area: 'vocal', rating: 4, message: '  Love the warm-ups  ', contact: ' ', page: '/' })).toEqual({
      area: 'vocal',
      rating: 4,
      message: 'Love the warm-ups',
      contact: null,
      page: '/',
      user_agent: null,
    })
  })

  it('files an unknown area under other', () => {
    expect(feedbackRow({ area: 'piano', message: 'hi' }).area).toBe('other')
  })

  it('refuses an empty message, a bad rating and a bad email', () => {
    expect(() => feedbackRow({ message: '   ' })).toThrow(/few words/)
    expect(() => feedbackRow({ message: 'x'.repeat(4001) })).toThrow(/4000/)
    expect(() => feedbackRow({ message: 'ok', rating: 6 })).toThrow(/1 to 5/)
    expect(() => feedbackRow({ message: 'ok', rating: 2.5 })).toThrow(/1 to 5/)
    expect(() => feedbackRow({ message: 'ok', contact: 'not-an-email' })).toThrow(/email/)
  })
})

describe.skipIf(!hasSupabaseEnv)('site feedback on the project', () => {
  it('can be sent signed out, and nobody reads it back', async () => {
    const anon = newClient()
    await sendFeedback(anon, { area: 'home', message: 'signed-out test', contact: 'someone@example.com' })
    const { data, error } = await anon.from('site_feedback').select('*')
    // No select policy: either an empty list or a permission error, never the row.
    expect(data ?? []).toEqual([])
    if (error) expect(error.code).toBe('42501')
  })

  it('is sent as the signed-in user, who cannot read it either', async () => {
    const { supabase } = await newTestUser('feedback')
    await sendFeedback(supabase, { area: 'vocal', rating: 5, message: 'signed-in test' })
    const { data } = await supabase.from('site_feedback').select('*')
    expect(data ?? []).toEqual([])
  })

  it('cannot be sent in someone else’s name', async () => {
    const { supabase } = await newTestUser('feedback-spoof')
    const { error } = await supabase
      .from('site_feedback')
      .insert({ message: 'spoof', user_id: '00000000-0000-0000-0000-000000000001' })
    expect(error).not.toBeNull()
  })

  it('stops at 10 messages an hour from one account', async () => {
    const { supabase } = await newTestUser('feedback-rate')
    for (let i = 0; i < 10; i++) await sendFeedback(supabase, { message: `msg ${i}` })
    await expect(sendFeedback(supabase, { message: 'one too many' })).rejects.toMatchObject({
      message: expect.stringMatching(/lot of feedback/),
    })
  })
})
