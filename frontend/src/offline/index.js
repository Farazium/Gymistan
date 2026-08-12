// The bits of the offline queue that pages need, in one import.

export { isQueueable, describeWrite } from './queueable'
export {
  subscribe, countFor, entriesFor, pendingFor, failedFor,
  update, remove, retry, isAvailable, PENDING, FAILED,
} from './queue'
export { replayQueue } from './replay'

/**
 * True when this reply came from the queue rather than the server.
 *
 * Pages need this for one reason above all: a queued write has no server id yet.
 * Anything that would use one — sending a WhatsApp receipt, opening a payment
 * slip, navigating to the new member's profile — has to be skipped, or it will
 * ask the server about a record that does not exist there.
 */
export function isQueued(res) {
  return res?.status === 202 && res?.data?.queued === true
}

/** What to tell the desk when a write went to the queue instead of the server. */
export const QUEUED_MESSAGE = 'Saved on this device — it will sync when the connection returns'
