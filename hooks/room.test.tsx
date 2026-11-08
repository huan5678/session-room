import { expect, mock, test } from 'claude-code/testing'

import { ALL_CHARACTERS, directionOf, nextRoom, packOf, parseLocalCast, roomSvg, setLocalCast, shortLabel, SVG_LIMIT } from './room'
import { CHARACTER, CHARACTER_BACK, WALK } from './sprites'

const PANE = {
  plugin: 'session-room',
  component: 'Pane',
  requestId: 'session-room',
  props: {
    title: 'Session 房間',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const seeded = (_: unknown, e: { key: string }) => ({
  value: e.key === 'room' ? SEEDED : { value: undefined, version: 0 },
})

const SEEDED = {
  value: {
    shape: 'room-3',
    value: {
      people: [{ id: 'local_ab', title: '範例任務', mood: 'busy', seat: 0, since: 1000, name: 'demo-task', note: '數值已定' }],
      leaving: [],
    },
  },
  version: 1,
}

test('the room draws on desktop, the roster alone on the terminal', async ($, on) => {
  on('state.get', seeded)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ type: 'Svg' }))?.props?.alt).toContain('工作中：範例任務')
  expect((await desktop.find({ type: 'Text', text: /數值已定/ }))?.text).toBe('數值已定')
  expect((await desktop.find({ type: 'Text', text: /demo-task/ }))?.text).toContain('demo-task')
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /範例任務/ }))?.text).toBe('範例任務')
  await terminal.unmount()
})

test('seats stick, a mood change walks, a leaver goes, no change is no redraw', () => {
  const a = { id: 'a', title: '<甲>', mood: 'busy', since: 1 } as const
  const b = { id: 'b', title: 'b', mood: 'idle', since: 1 } as const
  const one = nextRoom({ people: [], leaving: [] }, [a, b])
  expect(one.people[0]?.from).toBeUndefined()
  expect(nextRoom(one, [a, b])).toBe(one)
  const two = nextRoom(one, [b, { ...a, mood: 'waiting' }])
  expect(two.people[0]?.seat).toBe(0)
  expect(two.people[0]?.from).toBeDefined()
  const three = nextRoom(two, [{ ...a, mood: 'waiting' }])
  expect(three.leaving[0]?.id).toBe('b')
  expect(nextRoom(three, [{ ...a, mood: 'waiting' }]).leaving).toEqual([])
  expect(roomSvg(two)).not.toContain('<甲>')
  const full = Array.from({ length: 15 }, (_, i) => ({ id: String(i), title: `第${i}號`, mood: 'waiting' as const, since: 1 }))
  expect(roomSvg(nextRoom({ people: [], leaving: [] }, full)).length).toBeLessThan(131072)
  expect(shortLabel('一二三四五六七八九十')).toBe('一二三四五六七…')
  expect(roomSvg(two)).not.toContain('data:')
  const crowd = Array.from({ length: 24 }, (_, i) => ({ id: String(i), title: `第${i}號`, mood: (['busy', 'idle', 'waiting'] as const)[i % 3] ?? 'busy', since: 1 }))
  expect(roomSvg(nextRoom({ people: [], leaving: [] }, crowd)).length).toBeLessThan(131072)
})

const HOST_DIR = '/h/Library/Application Support/Claude/claude-code-sessions'
const LIVE_DIR = '/h/.claude/sessions'

test('a status file changing redraws the room with no reload', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const files = new Map<string, string>()
  const live = (status: string, cwd = '/p') =>
    JSON.stringify({ pid: 7, sessionId: 's', cwd, name: '舊名', status, hostSessionId: 'local_x' })
  const host = (over: object) =>
    JSON.stringify({ sessionId: 'local_x', title: '範例任務', lastAssistantUuid: 'u', ...over })

  files.set(`${LIVE_DIR}/7.json`, live('busy'))
  files.set(`${HOST_DIR}/acc/org/local_x.json`, host({}))

  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/h' : undefined }))
  on('session.root', () => ({ value: '/p' }))
  on('fs.list', (_, e) => {
    const prefix = `${e.path}/`
    const names = [...files.keys()]
      .filter(path => path.startsWith(prefix))
      .map(path => path.slice(prefix.length))
    const seen = new Set(names.map(name => name.split('/')[0] ?? ''))

    return {
      value: [...seen].map(name => ({
        name,
        kind: names.includes(name) ? 'file' : 'dir',
        size: 0,
        mtimeMs: files.get(`${prefix}${name}`)?.length ?? 0,
        isLink: false,
      })),
    }
  })
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '7\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: { command: 'session-room' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const altNow = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const alt = (await ui.find({ type: 'Svg' }))?.props?.alt
    await ui.unmount()

    return alt
  }
  // The first tick reads everything: the app's title wins over the file's name.
  expect(await altNow()).toBe('工作中：範例任務')

  files.set(`${LIVE_DIR}/7.json`, live('waiting'))
  await clock.advance(2000)
  expect(await altNow()).toBe('等你：範例任務')

  files.set(`${LIVE_DIR}/7.json`, live('idle'))
  await clock.advance(2000)
  expect(await altNow()).toBe('閒置：範例任務')

  files.set(`${HOST_DIR}/acc/org/local_x.json`, host({ isArchived: true }))
  // An archived session's character and card go on the next poll.
  await clock.advance(2000)
  expect(await altNow()).toBe('房間是空的')
})

test('pressing a card opens that session', async ($, on) => {
  on('state.get', seeded)
  const ran: Array<readonly string[]> = []
  on('process.run', (_, e) => {
    ran.push(e.argv)

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'card-local_ab' })
  expect(ran).toEqual([['open', 'claude://claude.ai/epitaxy/local_ab']])
  await ui.unmount()
})

test('each person has a name button that opens their session', async ($, on) => {
  on('state.get', seeded)
  const ran: Array<readonly string[]> = []
  on('process.run', (_, e) => {
    ran.push(e.argv)

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).map(one => one.props?.alt)).toContain('範例任務 的角色')
  await ui.press({ key: 'goto-local_ab' })
  expect(ran).toEqual([['open', 'claude://claude.ai/epitaxy/local_ab']])
  await ui.press({ key: 'face-local_ab' })
  expect(ran[1]).toEqual(['open', 'claude://claude.ai/epitaxy/local_ab'])
  await ui.unmount()
})

const CAST_PANE = { ...PANE, requestId: 'session-room-cast' } as const

test('the cast pane removes a character and saves the choice', async ($, on) => {
  const saved: unknown[] = []
  on('store.set', (_, e) => {
    saved.push(e.value)

    return { value: undefined }
  })
  const ui = await $.ui.mount({ ...CAST_PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /已選/ }))?.text).toContain('已選 24 / 24')

  await ui.press({ key: 'cast-0' })
  expect((await ui.find({ type: 'Text', text: /已選/ }))?.text).toContain('已選 23 / 24')
  expect(saved.at(-1)).toHaveLength(23)

  await ui.press({ key: 'cast-all' })
  expect((await ui.find({ type: 'Text', text: /已選/ }))?.text).toContain('已選 24 / 24')
  await ui.unmount()
})

test('a walk faces its way, in all eight directions', () => {
  const from: [number, number] = [50, 50]
  const seen = [[50, 0], [90, 10], [90, 50], [90, 90], [50, 90], [10, 90], [10, 50], [10, 10]] as const
  expect(seen.map(to => directionOf(from, to))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})

const person = (i: number, mood: 'busy' | 'idle' | 'waiting') => ({ id: String(i), title: `第${i}號`, mood, since: 1 })
// Only the walk frames carry this; a bubble's bob repeats by count.
const STRIDING = 'repeatDur='

test('someone walking plays the frames for their direction, and only while walking', () => {
  const still = nextRoom({ people: [], leaving: [] }, [person(0, 'busy')])
  expect(roomSvg(still)).not.toContain(WALK[0]?.[0]?.[0])
  // From the desk to the rug below it: south, though the seat is at the left of the rug's row.
  const moved = nextRoom(still, [person(0, 'waiting')])
  const svg = roomSvg(moved)
  for (const frame of WALK[0]?.[4] ?? []) expect(svg).toContain(frame)
  expect(svg).toContain(STRIDING)
})

test('a leaver walks to the door with their frames', () => {
  const one = nextRoom({ people: [], leaving: [] }, [person(0, 'waiting'), person(1, 'busy')])
  const gone = nextRoom(one, [person(1, 'busy')])
  expect(gone.leaving[0]?.id).toBe('0')
  expect(roomSvg(gone)).toContain(STRIDING)
})

const everyoneWalks = (count: number) => {
  const ids = Array.from({ length: count }, (_, i) => i)
  const first = nextRoom({ people: [], leaving: [] }, ids.map(i => person(i, 'busy')))

  return nextRoom(first, ids.map(i => person(i, i % 2 ? 'idle' : 'waiting')))
}

test('a walk keeps its frames while they fit, and the room stays under the limit past that', () => {
  expect(roomSvg(everyoneWalks(11))).toContain(STRIDING)
  for (const count of [11, 15, 24, 30]) expect(roomSvg(everyoneWalks(count)).length).toBeLessThanOrEqual(SVG_LIMIT)
  // Too many walking for their frames: they slide this once, and the room is still drawn.
  expect(roomSvg(everyoneWalks(24))).not.toContain(STRIDING)
})

const FRONT = '<path stroke="#112233" d="M1 2.5h3"/>'
const BACK = '<path stroke="#445566" d="M0 0.5h1"/>'
const localFile = (over: object = {}) =>
  JSON.stringify({ characters: [{ pack: '本機', offset: [-5, -5], front: FRONT, back: BACK, walk: Array.from({ length: 8 }, () => [FRONT, BACK, FRONT]), ...over }] })

test('a cast file adds characters after the built-in ones, and the room draws them', () => {
  const builtIn = ALL_CHARACTERS.length
  const parsed = parseLocalCast(localFile())
  expect(parsed).toHaveLength(1)
  setLocalCast(parsed)
  try {
    expect(ALL_CHARACTERS).toHaveLength(builtIn + 1)
    expect(ALL_CHARACTERS[0]).toBe(builtIn)
    expect(packOf(builtIn)).toBe('本機')
    const room = nextRoom({ people: [], leaving: [] }, [person(0, 'idle'), person(1, 'busy')])
    const svg = roomSvg(room, [builtIn])
    expect(svg).toContain(`<g transform="translate(-5 -5)">${FRONT}</g>`)
    expect(svg).toContain(`<g transform="translate(-5 -5)">${BACK}</g>`)
  } finally {
    setLocalCast([])
  }
  expect(ALL_CHARACTERS).toHaveLength(builtIn)
})

test('a cast file can only bring pixels into the drawing', () => {
  const hostile = '<script>alert(1)</script>'
  for (const over of [
    { front: hostile },
    { back: '<path stroke="#112233" d="M1 2.5h3" onload="alert(1)"/>' },
    { walk: Array.from({ length: 8 }, () => [hostile, FRONT, FRONT]) },
    { walk: [[FRONT, FRONT, FRONT]] },
    { offset: ['1) scale(9', 0] },
    { pack: '' },
  ])
    expect(parseLocalCast(localFile(over))).toEqual([])
  expect(parseLocalCast('{"characters":[null,3]}')).toEqual([])
  expect(parseLocalCast('[]')).toEqual([])
})

test('the room draws only the chosen characters', () => {
  const room = nextRoom({ people: [], leaving: [] }, [
    { id: 'a', title: 'a', mood: 'busy', since: 1 },
    { id: 'b', title: 'b', mood: 'idle', since: 1 },
  ])
  const svg = roomSvg(room, [5])
  // Asleep facing us, at the desk with their back to us.
  expect(svg).toContain(CHARACTER[5])
  expect(svg).toContain(CHARACTER_BACK[5])
  expect(svg).not.toContain(CHARACTER[0])
  expect(svg).not.toContain(CHARACTER_BACK[0])
})
