/**
 * Small line icons for the Home page headings and buttons (24×24, drawn in
 * the text colour). The instrument pictures come from nav/TabIcons.jsx.
 */

const props = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

/** Continue practice: a target with an arrow back into it. */
export function PracticeIcon() {
  return (
    <svg {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-4-7.2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17 3v4h4" />
    </svg>
  )
}

/** Working on: a target. */
export function TargetIcon() {
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** Quick practice: a lightning bolt. */
export function BoltIcon() {
  return (
    <svg {...props} fill="currentColor" stroke="none">
      <path d="M13.5 2 4.5 13.5h6l-1 8.5 9-11.5h-6z" />
    </svg>
  )
}

/** Recent activity: two people. */
export function PeopleIcon() {
  return (
    <svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5c.4-3.6 2.8-5.8 6-5.8s5.6 2.2 6 5.8" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14c1.7.7 2.8 2.6 3 5.2" />
    </svg>
  )
}

/** My files: a page with a folded corner. */
export function FileIcon() {
  return (
    <svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  )
}

/** A music note (MIDI, activity items). */
export function NoteIcon() {
  return (
    <svg {...props}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  )
}

/** Trouble spots: sound bars. */
export function WaveIcon() {
  return (
    <svg {...props}>
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ChevronIcon() {
  return (
    <svg {...props} width={18} height={18}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg {...props} width={18} height={18}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function CommentIcon() {
  return (
    <svg {...props} width={18} height={18}>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
    </svg>
  )
}