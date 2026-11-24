export const STUCK_MS = 30_000

const entries = [
  ['home.overview', 'Home', 'Find your recent practice and saved files here. Open a song to start building your history.', 'open a song'],
  ['guitar.songs', 'Guitar songs', 'Pick a song from the library, then choose how to practise it.', 'open a song'],
  ['guitar.song.modes', 'Practice modes', 'Choose Listen to hear the song, Wait for me to play at your pace, or Trouble spots to find what to repeat. Press Play when you’re ready.', 'play'],
  ['guitar.song.section', 'Practice section', 'Choose a range of bars to focus on the part you want to repeat.', null],
  ['guitar.learn', 'Guitar lessons', 'Learn chord shapes and how to move between them. Open a lesson to hear the first chord.', 'open a lesson'],
  ['guitar.learn.lesson', 'Guided lesson', 'Use Hint to hear the chord, or Skip or Unlock anyway to keep moving. Start when you’re ready to play.', 'start'],
  ['guitar.exercises', 'Guitar exercises', 'Pick an exercise to work on rhythm, recognize chord shapes, or train your ear.', 'open an exercise'],
  ['guitar.tuner', 'Guitar tuner', 'Start the tuner and play one open string at a time. Adjust the string until the reading is centered.', 'start'],
  ['vocal.songs', 'Vocal songs', 'Pick a song from the library, then choose how to practise it.', 'open a song'],
  ['vocal.song.modes', 'Practice modes', 'Choose Listen to hear the song, Wait for me to sing at your pace, or Trouble spots to find what to repeat. Press Play when you’re ready.', 'play'],
  ['vocal.learn', 'Vocal lessons', 'Open a warm-up or activity to work on your range, pitch, or harmony.', 'open an activity'],
  ['vocal.compose', 'Vocal arranger', 'Turn a score into an arrangement for your voice. Start by choosing a source score.', 'start an arrangement'],
  ['social.overview', 'Social', 'Find friends and see the practice they share with you. Sign in to add a friend or accept an invite.', null],
  ['home.files', 'My Files', 'Scores you open from a file appear here. Choose a score to add it and open it in Guitar.', null],
  ['home.activity', 'Recent activity', 'See the practice you’ve shared and the attempts friends have sent you. Open an attempt to see its score and comments.', null],
  ['home.working', 'Working on', 'Songs you practise appear here. Choose one to review its attempts or return to practice.', null],
  ['home.account', 'Account', 'Use this page to manage your Harmonic account and sign-in.', null],
  ['guitar.search', 'Search for a score', 'Search the song catalog by title, then choose a result to open its score.', null],
  ['vocal.search', 'Search for a score', 'Search the song catalog by title, then choose a result to open its score.', null],
  ['guitar.sessions', 'Practice sessions', 'Open a session to review your runs and notes. Choose Practise to revisit a song.', null],
  ['vocal.sessions', 'Practice sessions', 'Open a session to review your attempts and notes. Choose Practise to revisit a song.', null],
  ['guitar.transcribe', 'Transcribe guitar', 'Choose a source recording to create a tab that you can review and edit.', null],
  ['guitar.fretboard', 'Fretboard map', 'Explore where notes sit on the neck. Change the tuning to see how the note positions shift.', null],
  ['guitar.learn.strum', 'Strum on the beat', 'Choose a pattern, then play along with the click. Use the calibration option if the timing feels off.', null],
  ['guitar.exercises.ear', 'Ear training', 'Listen to the example, then choose what you heard. Replay it as often as you need.', null],
  ['guitar.exercises.rhythm', 'Rhythm studio', 'Pick a pattern and match the beat by tapping or strumming. Start with taps if you want to practise without a microphone.', null],
  ['guitar.exercises.identify', 'Name that shape', 'Read the chord diagram, then choose the name that matches the shape.', null],
  ['guitar.exercises.build', 'Build a chord', 'Place each finger on the fretboard, then check the shape. Remember to mark the open and muted strings.', null],
  ['vocal.learn.warmup', 'Vocal warm-up', 'Choose your voice part and a direction. Follow the piano as it moves through your range.', null],
  ['vocal.learn.pitch', 'Pitch test', 'Listen to the phrase, then sing the notes back when prompted.', null],
  ['vocal.learn.harmony', 'Harmony test', 'Listen to the chord, then sing and hold its middle note.', null],
  ['vocal.learn.rhythm', 'Clap along', 'Listen to the beat, then tap along with the rhythm on screen.', null],
  ['vocal.learn.solfege', 'Solfège', 'Use do, re, and mi to connect the notes you hear with the notes on the staff.', null],
]

export const TIPS = Object.fromEntries(entries.map(([id, title, body, mainAction]) => {
  const area = id.split('.')[0]
  const instrument = ['guitar', 'vocal'].includes(area) ? area : null
  return [id, { id, surface: id, instrument, title, body, mainAction }]
}))
