export type Mood = 'busy' | 'waiting' | 'idle'

export type Person = {
  id: string
  title: string
  mood: Mood
  /** Why it waits, in the session's own words, when it says. */
  waitingFor?: string
  seat: number
  /** Since when, in ms, it has been in this mood; 0 when unknown. */
  since: number
  /** The short name a linked session goes by. */
  name?: string
  /** What its last finished turn came to, in the app's words. */
  note?: string
  /** Where a walk starts in this drawing: a mood change or an arrival. */
  from?: [number, number]
}

export type Room = {
  people: Person[]
  /** Walking out of the door in this drawing, then gone. */
  leaving: Array<{ id: string; title: string; seat: number; from: [number, number] }>
}

declare module 'claude-code' {
  interface PluginState {
    'session-room': { room: Shaped<Room>; minute: number; expanded: string[]; cast: number[]; diagnosis: string }
  }
}
