/** Recovery is available without starting another run or changing mic permissions. */
export default function HearingHelp() {
  return <details className="hearing-help">
    <summary>Microphone too quiet? Try these checks</summary>
    <ul>
      <li>Move your device closer to the guitar and play one clear note.</li>
      <li>Use headphones so the microphone hears your guitar rather than the backing track.</li>
      <li>Check that your browser is using the intended microphone. Stop and start the run after changing it.</li>
    </ul>
    <p>In Wait for me, silence does not count as a wrong attempt. Hint, Skip and Retry remain available.</p>
  </details>
}
