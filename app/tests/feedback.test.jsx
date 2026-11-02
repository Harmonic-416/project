// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FeedbackDialog from '../src/feedback/FeedbackDialog.jsx'
import { areaForTab, canSendFeedback, emptyFeedback, feedbackError } from '../src/feedback/feedbackForm.js'

afterEach(cleanup)

describe('feedback form (pure)', () => {
  it('starts on the tab it was opened from', () => {
    expect(emptyFeedback('vocal')).toEqual({ area: 'vocal', rating: null, message: '', contact: '' })
    expect(areaForTab('guitar')).toBe('guitar')
    expect(areaForTab('somewhere')).toBe('other')
  })

  it('needs a message that is more than spaces', () => {
    expect(canSendFeedback({ message: '  ' })).toBe(false)
    expect(canSendFeedback({ message: ' hi ' })).toBe(true)
  })

  it('shows the form’s and the database’s reasons, and a plain line otherwise', () => {
    expect(feedbackError(new Error('Write a few words first.'))).toBe('Write a few words first.')
    expect(feedbackError({ code: 'P0001', message: 'Too many' })).toBe('Too many')
    expect(feedbackError(new TypeError('Failed to fetch'))).toMatch(/connection/)
    expect(feedbackError({ code: '42501', message: 'permission denied' })).toMatch(/connection/)
  })
})

describe('FeedbackDialog', () => {
  const open = (props) =>
    render(<FeedbackDialog tab="vocal" signedIn={false} onClose={() => {}} cloud send={vi.fn(async () => {})} {...props} />)

  it('sends the area, rating, message and email, then thanks', async () => {
    const send = vi.fn(async () => {})
    open({ send })
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'vocal')
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: '4 of 5' }))
    fireEvent.change(screen.getByPlaceholderText(/What worked/), { target: { value: 'The warm-up is great' } })
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'me@example.com' } })
    fireEvent.click(sendButton)
    expect(await screen.findByText('Thanks — the team reads every message.')).toBeTruthy()
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ area: 'vocal', rating: 4, message: 'The warm-up is great', contact: 'me@example.com' }),
    )
  })

  it('asks no email of someone signed in', () => {
    open({ signedIn: true })
    expect(screen.queryByLabelText(/Email/)).toBeNull()
  })

  it('keeps the message and shows why when sending fails', async () => {
    open({ send: vi.fn(async () => Promise.reject({ code: 'P0001', message: 'That’s a lot of feedback in one hour' })) })
    fireEvent.change(screen.getByPlaceholderText(/What worked/), { target: { value: 'again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/lot of feedback/)
    expect(screen.getByPlaceholderText(/What worked/)).toHaveProperty('value', 'again')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
