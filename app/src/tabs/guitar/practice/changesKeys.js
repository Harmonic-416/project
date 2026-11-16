/** Space counts a deliberate tap; focused controls keep their native behavior. */
export function isChangeTapKey(event) {
  if (event.code !== 'Space' || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const target = event.target
  if (target?.isContentEditable || target?.closest?.('button, input, textarea, select, a, summary, [contenteditable="true"], [role="button"]')) return false
  return true
}
