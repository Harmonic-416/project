import { useId } from 'react'

/**
 * Icons for the bottom tab bar and the Home cards. Original solid
 * silhouettes on a 32×32 grid, filled with the text colour (currentColor) so
 * the active tab tints them teal. Cut-outs (sound hole, frets, grille) are
 * masks, so they show whatever is behind the icon.
 */

const svgProps = {
  width: 26,
  height: 26,
  viewBox: '0 0 32 32',
  'aria-hidden': true,
  focusable: 'false',
}

/** Home: a solid rounded house. */
export function HomeIcon() {
  return (
    <svg {...svgProps}>
      <path
        fill="currentColor"
        d="M16 3.6c.5 0 1 .2 1.4.5l11 9.3c.9.8.4 2.3-.8 2.3H26v10.5a2.8 2.8 0 0 1-2.8 2.8H8.8A2.8 2.8 0 0 1 6 26.2V15.7H4.4c-1.2 0-1.7-1.5-.8-2.3l11-9.3c.4-.3.9-.5 1.4-.5z"
      />
    </svg>
  )
}

/** Guitar: an acoustic guitar silhouette, tilted, with sound hole, frets and bridge. */
export function GuitarIcon() {
  const mask = useId()
  return (
    <svg {...svgProps}>
      <mask id={mask}>
        <rect width="32" height="32" fill="#fff" />
        <circle cx="16" cy="18.2" r="2.3" fill="#000" />
        <rect x="13" y="25.4" width="6" height="1" rx="0.5" fill="#000" />
        <path d="M15.1 7.2h1.8M15.1 9.4h1.8M15.1 11.6h1.8M15.1 13.8h1.8" stroke="#000" strokeWidth="0.55" />
      </mask>
      <g transform="rotate(42 16 16) translate(0 -0.6)" fill="currentColor" mask={`url(#${mask})`}>
        {/* headstock + tuning pegs */}
        <rect x="14.3" y="0.9" width="3.4" height="3.8" rx="0.9" />
        <circle cx="13.5" cy="2" r="0.65" />
        <circle cx="13.5" cy="3.7" r="0.65" />
        <circle cx="18.5" cy="2" r="0.65" />
        <circle cx="18.5" cy="3.7" r="0.65" />
        {/* neck */}
        <rect x="14.9" y="4" width="2.2" height="12" />
        {/* body: upper and lower bouts */}
        <ellipse cx="16" cy="18" rx="5.4" ry="4.6" />
        <ellipse cx="16" cy="24.4" rx="7" ry="5.6" />
      </g>
    </svg>
  )
}

/** Vocal: a vintage studio mic — slotted grille, side yoke, stand and round base. */
export function MicIcon() {
  const mask = useId()
  return (
    <svg {...svgProps}>
      <mask id={mask}>
        <rect width="32" height="32" fill="#fff" />
        <path d="M11.8 6.2h8.4M11 8.9h10M11 11.6h10M11 14.3h10M11.8 17h8.4" stroke="#000" strokeWidth="1.1" strokeLinecap="round" />
      </mask>
      <rect x="9.2" y="2.4" width="13.6" height="17.8" rx="6.8" fill="currentColor" mask={`url(#${mask})`} />
      <path d="M24.4 9.5v4.3a8.4 8.4 0 0 1-8.4 8.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="14.9" y="21.6" width="2.2" height="4.6" fill="currentColor" />
      <ellipse cx="16" cy="27.6" rx="6.2" ry="1.9" fill="currentColor" />
    </svg>
  )
}