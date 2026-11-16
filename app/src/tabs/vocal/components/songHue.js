/** A stable hue per title, for the song card's colour shown on its gradient cover. */
export const hueFor = (title) => [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
