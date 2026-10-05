export type EventLike = { type: string }

/** True for the first session boundary of a process; used to fire the startup toast. */
export function isSessionBoundary(event: EventLike): boolean {
  return event.type === "session.created" || event.type === "server.connected"
}
