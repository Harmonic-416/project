import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteDraft, draftsAvailable, listDrafts, loadDraft, saveDraft } from '../src/tabs/guitar/song/drafts.js'

const bytes = (text) => new TextEncoder().encode(text).buffer

describe('drafts on this device', () => {
  it('saves, lists the latest first, reopens and deletes', async () => {
    expect(draftsAvailable()).toBe(true)
    await saveDraft({ id: 'a', title: 'Riff (draft)', format: 'musicxml', bytes: bytes('<score-partwise/>') })
    await new Promise((r) => setTimeout(r, 5))
    await saveDraft({ id: 'b', title: 'Solo (draft)', format: 'musicxml', bytes: bytes('<x/>') })
    expect((await listDrafts()).map((d) => d.id)).toEqual(['b', 'a'])

    const a = await loadDraft('a')
    expect(a).toMatchObject({ id: 'a', title: 'Riff (draft)', format: 'musicxml' })
    expect(new TextDecoder().decode(a.bytes)).toBe('<score-partwise/>')

    await deleteDraft('b')
    expect((await listDrafts()).map((d) => d.id)).toEqual(['a'])
    expect(await loadDraft('b')).toBeNull()
  })

  it('replaces a draft of the same recording, keeping when it was first made', async () => {
    await saveDraft({ id: 'c', title: 'Take 1 (draft)', format: 'musicxml', bytes: bytes('1') })
    const first = await loadDraft('c')
    await new Promise((r) => setTimeout(r, 5))
    await saveDraft({ id: 'c', title: 'Take 1 (draft)', format: 'guitar-pro', bytes: bytes('2') })
    const second = await loadDraft('c')
    expect(second.format).toBe('guitar-pro')
    expect(second.created).toBe(first.created)
    expect(second.updated).toBeGreaterThan(first.updated)
  })
})
