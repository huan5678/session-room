import { expect, mock, test } from 'claude-code/testing'

import { nextRoom, roomSvg, shortLabel } from './room'
import { CHARACTER } from './sprites'

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

  await ui.press({ key: 'cast-humans' })
  expect((await ui.find({ type: 'Text', text: /已選/ }))?.text).toContain('已選 18 / 24')
  await ui.unmount()
})

test('the room draws only the chosen characters', () => {
  const room = nextRoom({ people: [], leaving: [] }, [
    { id: 'a', title: 'a', mood: 'busy', since: 1 },
    { id: 'b', title: 'b', mood: 'idle', since: 1 },
  ])
  const svg = roomSvg(room, [5])
  expect(svg).toContain(CHARACTER[5])
  expect(svg).not.toContain(CHARACTER[0])
})
