import type { Mood, Person, Room } from '../types'

import { CHARACTER, TILE } from './sprites'

/** One session as read from disk, before it has a seat. */
export type Seen = {
  id: string
  title: string
  mood: Mood
  since: number
  name?: string
  note?: string
  waitingFor?: string
}

const T = 16
const COLS = 3
const WIDTH = 14 * T
const SIDE = 4
const CELL = (WIDTH - 2 * SIDE) / COLS
const CELL_H = 52
const WALL = 2 * T
const CELLS = WALL + 6
const RUG_ROW = 3 * T
const WALK = 1.2
const FLOOR = '#eaa56c'
const TRIM = '#3e2731'

type Layout = { rows: number; rug: number; rugRows: number; height: number }

const layoutOf = (people: readonly Pick<Person, 'seat' | 'mood'>[]): Layout => {
  const seats = people.reduce((most, one) => Math.max(most, one.seat + 1), 1)
  const rows = Math.ceil(seats / COLS)
  const rug = CELLS + rows * CELL_H + 2
  const waiting = people.filter(one => one.mood === 'waiting').length
  const rugRows = Math.max(1, Math.ceil(waiting / COLS))

  return { rows, rug, rugRows, height: rug + rugRows * RUG_ROW + 8 }
}

export const roomSize = (room: Room) => ({ width: WIDTH, height: layoutOf(room.people).height })

const cellX = (index: number) => SIDE + CELL * (index % COLS)
const cellY = (seat: number) => CELLS + Math.floor(seat / COLS) * CELL_H

const DOOR: [number, number] = [WIDTH / 2 - T / 2, WALL - 6]

/** Each seat is a bay, machine on the left, bench on the right; waiters go to the marked area. */
const spotOf = (
  person: Pick<Person, 'seat' | 'mood'>,
  place: number,
  layout: Layout,
): [number, number] => {
  if (person.mood === 'busy') return [cellX(person.seat) + 8, cellY(person.seat) + 11]
  if (person.mood === 'idle') return [cellX(person.seat) + 44, cellY(person.seat) + 14]

  return [cellX(place) + CELL / 2 - T / 2, layout.rug + Math.floor(place / COLS) * RUG_ROW + 12]
}

const placesOf = <P extends Pick<Person, 'seat' | 'mood'>>(people: readonly P[], layout: Layout) => {
  let waiting = 0

  return people.map(person => ({
    person,
    spot: spotOf(person, person.mood === 'waiting' ? waiting++ : 0, layout),
  }))
}

const same = (a: Room, b: Room) =>
  a.leaving.length === 0 &&
  b.leaving.length === 0 &&
  JSON.stringify(a.people.map(({ from: _, ...one }) => one)) ===
    JSON.stringify(b.people.map(({ from: _, ...one }) => one))

/**
 * The next room for what was just seen: seats stay with their sessions, a mood
 * change walks from the old spot, a newcomer from the door, a leaver to it.
 * Answers `room` itself when nothing changed, so an idle poll draws nothing.
 */
export const nextRoom = (room: Room, seen: readonly Seen[]): Room => {
  const before = new Map(room.people.map(one => [one.id, one]))
  const taken = new Set(seen.flatMap(one => before.get(one.id)?.seat ?? []))
  const isFirst = room.people.length === 0 && room.leaving.length === 0
  let free = 0
  const seated = seen.map(one => {
    const old = before.get(one.id)
    if (old) return { ...one, seat: old.seat }
    while (taken.has(free)) free++
    taken.add(free)

    return { ...one, seat: free }
  })
  seated.sort((a, b) => a.seat - b.seat)

  const oldSpots = new Map(
    placesOf(room.people, layoutOf(room.people)).map(({ person, spot }) => [person.id, spot]),
  )
  const people: Person[] = seated.map(one => {
    const old = before.get(one.id)
    const { waitingFor, ...rest } = one
    // A session's status file is touched without its mood changing: the first time counts.
    const since = old?.mood === one.mood ? old.since : one.since
    const person: Person = waitingFor ? { ...rest, since, waitingFor } : { ...rest, since }
    if (!old) return isFirst ? person : { ...person, from: DOOR }
    if (old.mood === one.mood) return person
    const from = oldSpots.get(one.id)

    return from ? { ...person, from } : person
  })
  const seenIds = new Set(seen.map(one => one.id))
  const leaving = room.people
    .filter(one => !seenIds.has(one.id))
    .map(one => ({
      id: one.id,
      title: one.title,
      seat: one.seat,
      from: oldSpots.get(one.id) ?? DOOR,
    }))
  const next = { people, leaving }

  return same(room, next) ? room : next
}

/** The desktop app's deep link to a session; ids come from local files, so they are checked. */
export const sessionLink = (id: string) =>
  /^local_[0-9a-f-]+$/.test(id) ? `claude://claude.ai/epitaxy/${id}` : undefined

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`)

/** Cuts a title to what fits under a character: CJK counts one, the rest about half. */
export const shortLabel = (title: string, room = 7) => {
  let used = 0
  let out = ''
  for (const ch of title) {
    const width = ch.charCodeAt(0) > 0x2e7f ? 1 : 0.56
    if (used + width > room) return `${out}…`
    used += width
    out += ch
  }

  return out
}

const tile = (name: keyof typeof TILE, x: number, y: number) =>
  `<g transform="translate(${x} ${y})">${TILE[name]}</g>`

const STATIONS = ['stationRed', 'stationYellow', 'stationGreen', 'stationBlue'] as const

const shell = ({ height, rows, rug, rugRows }: Layout) => {
  const out: string[] = [`<rect width="${WIDTH}" height="${height}" fill="${FLOOR}"/>`]
  // ponytail: fixed scatter, enough to break up the floor without a seeded generator.
  for (let y = WALL; y < rug; y += 2 * T)
    for (let x = ((y / T) % 5) * T; x < WIDTH; x += 5 * T) out.push(tile('floorSpeck', x, y))
  // Outside: ground and a pipe run; then the factory wall with its shutter door.
  for (let x = 0; x < WIDTH; x += T) {
    out.push(tile('ground', x, 0), tile('pipe', x, 0))
    out.push(tile(x % (3 * T) === 0 ? 'wallSeam' : 'wall', x, T))
  }
  out.push(tile('valve', 3 * T, 0), tile('valve', WIDTH - 4 * T, 0))
  out.push(tile('doorL', WIDTH / 2 - T, T), tile('doorR', WIDTH / 2, T))
  out.push(tile('shelfB', 2 * T, T), tile('crate', 3 * T, T), tile('lamp', WIDTH - 3 * T, T), tile('flag', WIDTH - 4 * T, T))

  // The waiting area: hazard tape around a checker floor, Tiny Factory's own marking.
  const across = Math.floor((WIDTH - 2 * SIDE) / T)
  const down = rugRows * 3
  const left = (WIDTH - across * T) / 2
  for (let c = 0; c < across; c++) {
    const name = c === 0 ? 'hazardL' : c === across - 1 ? 'hazardR' : 'hazard'
    out.push(tile(name, left + c * T, rug + (down - 1) * T))
  }

  for (let seat = 0; seat < rows * COLS; seat++) {
    const station = STATIONS[seat % STATIONS.length] ?? 'stationBlue'
    out.push(tile(station, cellX(seat) + 8, cellY(seat)))
    out.push(tile('bench', cellX(seat) + 44, cellY(seat) + 14))
  }

  out.push(
    `<rect y="${WALL}" width="3" height="${height - WALL}" fill="${TRIM}"/>`,
    `<rect x="${WIDTH - 3}" y="${WALL}" width="3" height="${height - WALL}" fill="${TRIM}"/>`,
    `<rect y="${height - 3}" width="${WIDTH}" height="3" fill="${TRIM}"/>`,
  )

  return out.join('')
}

const FONT = `font-family="system-ui,-apple-system,'PingFang TC',sans-serif"`

const label = (title: string, x: number, y: number) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" font-weight="600" ${FONT} fill="#fff" stroke="${TRIM}" stroke-width="2.4" paint-order="stroke" shape-rendering="auto">${escapeXml(shortLabel(title))}</text>`

const walkTo = (from: [number, number], to: [number, number]) =>
  `<animateTransform attributeName="transform" type="translate" from="${from[0]} ${from[1]}" to="${to[0]} ${to[1]}" dur="${WALK}s" fill="freeze"/>`

const bob = (px: number, dur: string) =>
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${px};0 0" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`

const bubble = (mark: string) =>
  `<g><rect x="2" y="-15" width="12" height="13" rx="2" fill="#fff" stroke="${TRIM}"/><path d="M6 -2 L8 1 L10 -2 Z" fill="#fff" stroke="${TRIM}" stroke-width=".6"/><text x="8" y="-5" text-anchor="middle" font-size="11" font-weight="700" ${FONT} fill="#d9480f">${mark}</text>${bob(2, '.8s')}</g>`

const typingDots = [0, 1, 2]
  .map(
    i =>
      `<rect x="${3 + i * 4}" y="-4" width="2" height="2" fill="#2f9e44" stroke="none"><animate attributeName="opacity" values="0.2;1;0.2" dur="0.9s" begin="${i * 0.2}s" repeatCount="indefinite"/></rect>`,
  )
  .join('')

const snoring = `<text x="13" y="0" font-size="9" font-weight="700" ${FONT} fill="#1c7ed6" stroke="#fff" stroke-width="1.5" paint-order="stroke">z<animate attributeName="y" values="2;-6" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/></text>`

/** The characters chosen to appear, as indexes into CHARACTER; seats go round them. */
export const ALL_CHARACTERS = CHARACTER.map((_, index) => index)

const sprite = (seat: number, cast: readonly number[]) => CHARACTER[cast[seat % cast.length] ?? 0] ?? ''

/** One character drawn alone, by its index in CHARACTER. */
export const pictureSvg = (index: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges" fill="none" stroke-width="1">${CHARACTER[index] ?? ''}</svg>`

/** A person's character alone, the same sprite their seat gives them in the room. */
export const characterSvg = (seat: number, cast: readonly number[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges" fill="none" stroke-width="1">${sprite(seat, cast)}</svg>`

const personSvg = (person: Person, spot: [number, number], cast: readonly number[]) => {
  const walking = person.from ? walkTo(person.from, spot) : ''
  const at = person.from ? '' : ` transform="translate(${spot[0]} ${spot[1]})"`
  const name = `<title>${escapeXml(person.title)}</title>`
  if (person.mood === 'busy') {
    return `<g${at}>${walking}${name}<g>${sprite(person.seat, cast)}${bob(1, '.5s')}</g>${typingDots}</g>`
  }
  if (person.mood === 'waiting') {
    const mark = person.waitingFor ? '!' : '?'

    return `<g${at}>${walking}${name}${sprite(person.seat, cast)}${bubble(mark)}${label(person.title, 8, 26)}</g>`
  }
  // Asleep on the mat, lying down once the walk has ended.
  const lie = person.from
    ? `<g>${sprite(person.seat, cast)}<animateTransform attributeName="transform" type="rotate" from="0 8 8" to="-90 8 8" begin="${WALK}s" dur=".2s" fill="freeze"/></g>`
    : `<g transform="rotate(-90 8 8)">${sprite(person.seat, cast)}</g>`

  return `<g${at}>${walking}${name}${lie}${snoring}</g>`
}

const leaverSvg = (one: Room['leaving'][number], cast: readonly number[]) =>
  `<g transform="translate(${DOOR[0]} ${DOOR[1]})" opacity="1">${walkTo(one.from, DOOR)}<animate attributeName="opacity" values="1;1;0" keyTimes="0;.85;1" dur="${WALK}s" fill="freeze"/>${sprite(one.seat, cast)}</g>`

/** The whole room as one SVG document of plain paths; animation is SMIL, so it runs with no script. */
export const roomSvg = (room: Room, cast: readonly number[] = ALL_CHARACTERS) => {
  const layout = layoutOf(room.people)
  const people = placesOf(room.people, layout)
  const sitters = people.filter(({ person }) => person.mood === 'busy' && !person.from)
  const others = people.filter(one => !sitters.includes(one))
  // A cubicle keeps its owner's name whether they are in it or not, unless they are on the rug.
  const names = room.people
    .filter(one => one.mood !== 'waiting')
    .map(one => label(one.title, cellX(one.seat) + CELL / 2, cellY(one.seat) + 43))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${layout.height}" width="${WIDTH * 2}" height="${layout.height * 2}" shape-rendering="crispEdges" fill="none" stroke-width="1">` +
    shell(layout) +
    sitters.map(({ person, spot }) => personSvg(person, spot, cast)).join('') +
    others.map(({ person, spot }) => personSvg(person, spot, cast)).join('') +
    room.leaving.map(one => leaverSvg(one, cast)).join('') +
    names.join('') +
    '</svg>'
  )
}

const MOOD_WORD: Record<Mood, string> = { busy: '工作中', waiting: '等你', idle: '閒置' }

export const describePerson = (person: Person) =>
  `${MOOD_WORD[person.mood]}：${person.title}${person.waitingFor ? `（${person.waitingFor}）` : ''}`

export const altOf = (room: Room) =>
  room.people.length === 0 ? '房間是空的' : room.people.map(describePerson).join('；')
