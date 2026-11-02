import { FEEDBACK_AREAS } from '@backend/feedback'

/** What each area is called in the form, in the order it lists them. */
export const AREA_LABELS = {
  home: 'Home',
  vocal: 'Vocal',
  guitar: 'Guitar',
  social: 'Social',
  other: 'Something else',
}

/** The area a tab's feedback is about by default: the tab itself, or "other". */
export function areaForTab(tab) {
  return FEEDBACK_AREAS.includes(tab) ? tab : 'other'
}

/** The empty form, opened from `tab`. */
export const emptyFeedback = (tab) => ({ area: areaForTab(tab), rating: null, message: '', contact: '' })

/** Whether Send is worth pressing: a message that isn't only spaces. */
export const canSendFeedback = (form) => form.message.trim().length > 0

/**
 * The error a failed send shows: the form's own check (sendFeedback) or the
 * database's reason (P0001, the hourly limit) as is, anything else plainly.
 */
export function feedbackError(err) {
  const ownCheck = err instanceof Error && !(err instanceof TypeError) && !('code' in err) && err.message
  if (err?.code === 'P0001' || ownCheck) return err.message
  return 'Could not send it. Check your connection and try again.'
}
