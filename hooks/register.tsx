import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Mood, Person, Room } from '../types'

import { ALL_CHARACTERS, altOf, characterSvg, nextRoom, packOf, parseLocalCast, pictureSvg, roomSize, roomSvg, sessionLink, setLocalCast, shortLabel, SVG_LIMIT } from './room'
import type { Seen } from './room'

const PANE = 'session-room'
const TITLE = 'Session 房間'
const POLL_MS = 2000
const SLOW_EVERY = 3

const room = atom({ plugin: 'session-room', key: 'room' } as const, { people: [], leaving: [] } as Room, {
  shape: 'room-3',
})
const minute = atom({ plugin: 'session-room', key: 'minute' } as const, 0)
const expanded = atom({ plugin: 'session-room', key: 'expanded' } as const, [] as string[])

const cast = atom({ plugin: 'session-room', key: 'cast' } as const, [...ALL_CHARACTERS])

const CAST_KEY = 'cast-axul-24'
const CAST_PANE = 'session-room-cast'
const CAST_TITLE = '選角色'
const CARDS_SHOWN = 3
const CANNOT_OPEN = '無法跳轉到這個 session'
const NOTE_CHARS = 60
const BOARD: ReadonlyArray<{ mood: Mood; heading: string; empty: string; accent: string }> = [
  { mood: 'waiting', heading: '✋ 等你回覆', empty: '沒有人在等你', accent: '#d9480f' },
  { mood: 'busy', heading: '⏳ 工作中', empty: '現在沒人在工作', accent: '#2f9e44' },
  { mood: 'idle', heading: '✅ 做完了', empty: '還沒有', accent: '#868e96' },
]

const clockTime = (ms: number) => {
  const at = new Date(ms)

  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** A card's second line: how long it has waited or worked, or when it finished. */
export const cardAge = (person: Person, now: number) => {
  if (person.since === 0) return ''
  if (person.mood === 'idle') return `${clockTime(person.since)} 做完`
  if (now === 0) return ''
  const minutes = Math.max(0, Math.floor((now - person.since) / 60000))
  const span = minutes < 60 ? `${minutes} 分鐘` : `${Math.floor(minutes / 60)} 小時`

  return person.mood === 'waiting' ? `等了 ${span}` : `做了 ${span}`
}

/** What a session's `~/.claude/sessions/<pid>.json` holds, as far as it is read here. */
type Live = {
  pid: number
  sessionId: string
  cwd: string
  name?: string
  status?: string
  statusUpdatedAt?: number
  waitingFor?: string
  hostSessionId?: string
  spare?: boolean
}

/** The fields of the desktop app's record of a session that matter here. */
type Host = {
  title?: string
  name?: string
  note?: string
  isArchived: boolean
  needsYou: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseLive = (text: string): Live | undefined => {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) return undefined
  const { pid, sessionId, cwd, name, status, statusUpdatedAt, waitingFor, hostSessionId, spare } = value
  if (typeof pid !== 'number' || typeof sessionId !== 'string' || typeof cwd !== 'string') return undefined

  return {
    pid,
    sessionId,
    cwd,
    ...(typeof name === 'string' && { name }),
    ...(typeof status === 'string' && { status }),
    ...(typeof statusUpdatedAt === 'number' && { statusUpdatedAt }),
    ...(typeof waitingFor === 'string' && { waitingFor }),
    ...(typeof hostSessionId === 'string' && { hostSessionId }),
    ...(spare === true && { spare }),
  }
}

const parseHost = (text: string): (Host & { id: string }) | undefined => {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || typeof value.sessionId !== 'string') return undefined
  const summary = value.postTurnSummary
  // A summary speaks only for the turn it summarizes: the last one, or it is stale.
  const fresh = isRecord(summary) && summary.summarizes_uuid === value.lastAssistantUuid ? summary : undefined
  const needsYou = fresh?.status_category === 'needs_input'
  const note = fresh?.needs_action || fresh?.status_detail

  const name = isRecord(value.spawnedFrom) ? value.spawnedFrom.name : undefined

  return {
    id: value.sessionId,
    ...(typeof name === 'string' && { name }),
    ...(typeof note === 'string' && { note }),
    isArchived: value.isArchived === true,
    needsYou,
    ...(typeof value.title === 'string' && { title: value.title }),
  }
}

export const register: Register = on => {
  // ponytail: last good reads, because a file caught mid-write should not make
  // a character leave. Module-local: a reload starts over and rereads at once.
  const lastLive = new Map<string, Live>()
  const hosts = new Map<string, Host>()
  const hostStamps = new Map<string, number>()
  let alive = new Set<number>()
  let ticks = 0
  let isTicking = false
  let isWindows = false

  on('session.start', async ($, e, next) => {
    isWindows = (await $.env.get('OS')) === 'Windows_NT'
    const home = isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')
    const configured = await $.env.get('CLAUDE_CONFIG_DIR')
    const liveDir = `${configured ?? `${home}/.claude`}/sessions`
    const hostDir = isWindows
      ? `${await $.env.get('APPDATA')}/Claude/claude-code-sessions`
      : `${home}/Library/Application Support/Claude/claude-code-sessions`
    const samePath = (path: string) => (isWindows ? path.replaceAll('\\', '/').toLowerCase() : path)

    const readLive = async () => {
      const names = (await $.fs.list(liveDir)).map(one => one.name).filter(name => name.endsWith('.json'))
      for (const gone of lastLive.keys()) if (!names.includes(gone)) lastLive.delete(gone)
      await Promise.all(
        names.map(async name => {
          const parsed = await $.fs
            .read(`${liveDir}/${name}`)
            .then(parseLive)
            .catch(() => undefined)
          if (parsed) lastLive.set(name, parsed)
        }),
      )
    }

    // The app's own records say what the status files do not: archived, needs input.
    // Only this project's live sessions, and only when a record changed: the folder
    // holds every project's records, at some 170 KB each.
    const readHosts = async (wanted: ReadonlySet<string>) => {
      const accounts = await $.fs.list(hostDir).catch(() => [])
      for (const account of accounts.filter(one => one.kind === 'dir')) {
        const orgs = await $.fs.list(`${hostDir}/${account.name}`).catch(() => [])
        for (const org of orgs.filter(one => one.kind === 'dir')) {
          const dir = `${hostDir}/${account.name}/${org.name}`
          const files = await $.fs.list(dir).catch(() => [])
          await Promise.all(
            files
              .filter(one => wanted.has(one.name.slice(0, -'.json'.length)) && hostStamps.get(one.name) !== one.mtimeMs)
              .map(async one => {
                const parsed = await $.fs
                  .read(`${dir}/${one.name}`)
                  .then(parseHost)
                  .catch(() => undefined)
                if (parsed) {
                  hosts.set(parsed.id, parsed)
                  hostStamps.set(one.name, one.mtimeMs)
                }
              }),
          )
        }
      }
    }

    // A process that died without cleaning up leaves its status file behind.
    const readAlive = async () => {
      const pids = [...lastLive.values()].map(one => String(one.pid))
      if (pids.length === 0) return
      if (isWindows) {
        const { stdout } = await $.process.run(['tasklist', '/FO', 'CSV', '/NH'], { timeoutMs: 5000 })
        alive = new Set([...stdout.matchAll(/^"[^"]*","(\d+)"/gm)].map(match => Number(match[1])))
        return
      }
      const { stdout } = await $.process.run(['ps', '-o', 'pid=', '-p', pids.join(',')], { timeoutMs: 5000 })
      alive = new Set(stdout.split('\n').map(Number).filter(Boolean))
    }

    const tick = async () => {
      if (isTicking) return
      isTicking = true
      try {
        const rootDir = samePath(await $.session.root()).replace(/\/\.claude\/worktrees\/[^/]+$/, '')
        await readLive()
        const inProject = [...lastLive.values()].filter(live => {
          const cwd = samePath(live.cwd)
          return !live.spare && (cwd === rootDir || cwd.startsWith(`${rootDir}/`))
        })
        await readHosts(new Set(inProject.flatMap(live => live.hostSessionId ?? [])))
        if (ticks++ % SLOW_EVERY === 0) await readAlive()

        const seen: Seen[] = []
        for (const live of inProject) {
          if (!alive.has(live.pid)) continue
          const host = live.hostSessionId ? hosts.get(live.hostSessionId) : undefined
          if (host?.isArchived) continue
          const isWaiting = live.status === 'waiting' || (live.status === 'idle' && host?.needsYou === true)
          const mood: Mood = isWaiting ? 'waiting' : live.status === 'busy' ? 'busy' : 'idle'
          seen.push({
            id: live.hostSessionId ?? live.sessionId,
            title: host?.title ?? live.name ?? live.sessionId.slice(0, 8),
            mood,
            since: live.statusUpdatedAt ?? 0,
            ...(host?.name && { name: host.name }),
            ...(host?.note && mood !== 'busy' && { note: host.note }),
            ...(live.waitingFor && { waitingFor: live.waitingFor }),
          })
        }
        await update($, room, current => nextRoom(current, seen))
        const thisMinute = Math.floor((await $.clock.now()) / 60000)
        if (thisMinute !== (await read($, minute))) await update($, minute, () => thisMinute)
      } finally {
        isTicking = false
      }
    }

    await $.command.register({ name: 'session-room', description: '打開 session 房間 pane' })
    await $.command.register({ name: 'session-room-cast', description: '選擇哪些角色加入 session 房間' })
    // The key names the character list's version: indexes mean other characters in another one.
    // Characters of this computer's own, which the repository cannot carry: none is the usual case.
    const local = await $.fs
      .read(`${configured ?? `${home}/.claude`}/session-room-local/cast.json`)
      .then(parseLocalCast)
      .catch(() => [])
    setLocalCast(local)
    const saved = await $.store.get(CAST_KEY)
    const valid = Array.isArray(saved) ? saved.filter((one): one is number => ALL_CHARACTERS.includes(one)) : []
    await update($, cast, () => (valid.length > 0 ? valid : [...ALL_CHARACTERS]))
    void tick().catch(() => undefined)
    $.clock.every(POLL_MS, () => {
      void tick().catch(() => undefined)
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'session-room' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Session 房間已打開。' }
  })

  on('command.run', { command: 'session-room-cast' }, async $ => {
    await $.ui.open({ id: CAST_PANE, title: CAST_TITLE })

    return { text: '選角色 pane 已打開。' }
  })

  on('ui.render', { component: 'Pane', requestId: CAST_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    if (!('Svg' in table)) return <Text dimColor>選角色要在有圖的畫面（desktop）才看得到。</Text>
    const { Svg } = table
    const chosen = await read($, cast)

    const choose = async (next: number[]) => {
      await update($, cast, () => next)
      await $.store.set(CAST_KEY, next)
    }
    const toggle = (index: number) => () => {
      if (chosen.length === 1 && chosen[0] === index) {
        $.ui.toast('至少要留一個角色')
        return
      }
      const next = chosen.includes(index)
        ? chosen.filter(one => one !== index)
        : ALL_CHARACTERS.filter(one => one === index || chosen.includes(one))
      void choose(next)
    }
    const packs = [...new Set(ALL_CHARACTERS.map(packOf))]

    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          已選 {chosen.length} / {ALL_CHARACTERS.length} 個。Session 比角色多時，角色會重複出現。
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="cast-all" onPress={() => void choose([...ALL_CHARACTERS])}>
            全選
          </Button>
        </Box>
        {packs.map(pack => (
          <Box flexDirection="column" gap={1}>
            <Text bold>{pack}</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {ALL_CHARACTERS.filter(index => packOf(index) === pack).map(index => {
                const isChosen = chosen.includes(index)

                return (
                  <Box
                    key={`cast-box-${index}`}
                    flexDirection="column"
                    alignItems="center"
                    borderStyle="round"
                    borderColor={isChosen ? '#2f9e44' : '#868e96'}
                    paddingX={1}
                  >
                    <Svg source={pictureSvg(index)} alt={`${pack} 角色 ${index + 1}`} width={32} height={34} />
                    <Button key={`cast-${index}`} plain onPress={toggle(index)}>
                      <Text color={isChosen ? '#2f9e44' : '#868e96'}>{isChosen ? '✓ 已加入' : '＋ 加入'}</Text>
                    </Button>
                  </Box>
                )
              })}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const current = await read($, room)
    const now = (await read($, minute)) * 60000
    const open = await read($, expanded)
    const chosen = await read($, cast)
    const columns = e.props.bodyColumns ?? 60

    const openSession = (link: string) => () => {
      // rundll32, not `start`: no shell parses the link.
      const command = isWindows ? ['rundll32', 'url.dll,FileProtocolHandler', link] : ['open', link]
      void $.process.run(command).catch(() => $.ui.toast(CANNOT_OPEN))
    }

    const card = (person: Person, accent: string) => {
      const link = sessionLink(person.id)
      const age = cardAge(person, now)
      const note = person.note && (person.note.length > NOTE_CHARS ? `${person.note.slice(0, NOTE_CHARS)}…` : person.note)

      return (
        <Box
          key={`box-${person.id}`}
          borderStyle="round"
          borderColor={accent}
          hover={{ borderStyle: 'bold' }}
          paddingX={1}
          flexDirection="column"
        >
          <Text weight="semibold" wrap="wrap">
            {person.title}
          </Text>
          {note && (
            <Text size="footnote" dimColor wrap="wrap">
              {note}
            </Text>
          )}
          <Box flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
            {person.name && (
              <Text size="caption" color="#6b4f3a" backgroundColor="#f1e8d9">
                {` ${person.name} `}
              </Text>
            )}
            {age && (
              <Text size="caption" dimColor>
                {age}
              </Text>
            )}
          </Box>
          {link && (
            <Button
              key={`card-${person.id}`}
              plain
              onPress={openSession(link)}
            >
              <Text size="caption" color={accent}>
                開啟 →
              </Text>
            </Button>
          )}
        </Box>
      )
    }

    const board = (
      <Box flexDirection={columns >= 45 ? 'row' : 'column'} gap={1}>
        {BOARD.map(({ mood, heading, empty, accent }) => {
          const people = current.people
            .filter(one => one.mood === mood)
            .sort((a, b) => b.since - a.since)
          const isOpen = open.includes(mood)
          const shown = isOpen ? people : people.slice(0, CARDS_SHOWN)

          return (
            <Box flexDirection="column" flexGrow={1} width={columns >= 45 ? '32%' : '100%'} gap={1}>
              <Box flexDirection="row" columnGap={1} alignItems="center">
                <Text bold color={accent}>
                  {heading}
                </Text>
                <Text size="caption" bold color="#fff" backgroundColor={accent}>
                  {` ${people.length} `}
                </Text>
              </Box>
              {people.length === 0 && (
                <Box borderStyle="dashed" paddingX={1}>
                  <Text size="footnote" dimColor>
                    {empty}
                  </Text>
                </Box>
              )}
              {shown.map(person => card(person, accent))}
              {people.length > CARDS_SHOWN && (
                <Button
                  key={`more-${mood}`}
                  onPress={() =>
                    update($, expanded, list =>
                      list.includes(mood) ? list.filter(one => one !== mood) : [...list, mood],
                    )
                  }
                >
                  {isOpen ? '收合' : `More +${people.length - CARDS_SHOWN}`}
                </Button>
              )}
            </Box>
          )
        })}
      </Box>
    )

    // The terminal has no Svg: there the board is the whole pane.
    if (!('Svg' in table)) return board
    const { Svg } = table
    const size = roomSize(current)
    // Explicit CSS pixels: a sandboxed frame left to size itself may stay tiny.
    const width = Math.min(960, Math.max(320, columns * 8))
    const source = roomSvg(current, chosen)

    return (
      <Box flexDirection="column" gap={1}>
        {source.length <= SVG_LIMIT ? (
          <Svg source={source} alt={altOf(current)} width={width} height={Math.round((width * size.height) / size.width)} isInteractive />
        ) : (
          <Text dimColor>人太多，房間畫不下，改看下方看板。</Text>
        )}
        <Box flexDirection="row">
          <Button
            key="open-cast"
            onPress={() => {
              void $.ui.open({ id: CAST_PANE, title: CAST_TITLE })
            }}
          >
            選角色
          </Button>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {current.people.map(person => {
            const link = sessionLink(person.id)

            return (
              link && (
                // One chip to the eye. An Svg takes no press and a Button holds no Svg, so the
                // picture has a blank Button over it: no `label`, which a surface would draw.
                <Box
                  key={`chip-${person.id}`}
                  flexDirection="row"
                  alignItems="center"
                  columnGap={1}
                  paddingX={1}
                  borderStyle="round"
                  hover={{ borderStyle: 'bold' }}
                >
                  <Box position="relative">
                    <Svg source={characterSvg(person.seat, chosen)} alt={`${person.title} 的角色`} width={24} height={26} />
                    <Box position="absolute" top={0} left={0}>
                      <Button key={`face-${person.id}`} plain onPress={openSession(link)}>
                        <Text size="heading">{'\u3000\u3000'}</Text>
                      </Button>
                    </Box>
                  </Box>
                  <Button key={`goto-${person.id}`} plain onPress={openSession(link)}>
                    <Text color={BOARD.find(one => one.mood === person.mood)?.accent}>●</Text>
                    {` ${shortLabel(person.title, 10)}`}
                  </Button>
                </Box>
              )
            )
          })}
        </Box>
        {board}
      </Box>
    )
  })
}
