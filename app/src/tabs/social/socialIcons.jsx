/** Small line icons for the Social tab (currentColor, 20×20). */

const props = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export function CopyIcon() {
  return (
    <svg {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg {...props}>
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  )
}

export function LinkIcon() {
  return (
    <svg {...props}>
      <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L10 5" />
      <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1" />
    </svg>
  )
}

export function UserPlusIcon() {
  return (
    <svg {...props}>
      <circle cx="8" cy="7" r="3.2" />
      <path d="M2.5 17a5.5 5.5 0 0 1 11 0M16 6v6M13 9h6" />
    </svg>
  )
}

export function PeopleIcon() {
  return (
    <svg {...props}>
      <circle cx="7.5" cy="7" r="3" />
      <path d="M2 17a5.5 5.5 0 0 1 11 0" />
      <circle cx="14" cy="6" r="2.4" />
      <path d="M13.5 11.2A4.6 4.6 0 0 1 18.5 16" />
    </svg>
  )
}

export function InboxIcon() {
  return (
    <svg {...props}>
      <path d="M3 11h4l1.5 2.5h3L13 11h4" />
      <path d="M5 4h10l2 7v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" />
    </svg>
  )
}

export function SendIcon() {
  return (
    <svg {...props}>
      <path d="M17.5 2.5 9 11M17.5 2.5 12 17.5l-3-6.5-6.5-3z" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg {...props} width="14" height="14">
      <path d="M13.5 3.5a2 2 0 0 1 3 3L7 16l-4 1 1-4z" />
    </svg>
  )
}
