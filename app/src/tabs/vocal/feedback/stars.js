/** 0–3 stars for a share of right answers (0–1). */
export function starsFor(ratio) {
  if (ratio >= 1) return 3
  if (ratio >= 0.7) return 2
  if (ratio >= 0.4) return 1
  return 0
}
