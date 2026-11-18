import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useAuthStore } from './auth.js'
import { useTrackImportStore } from './trackImport.js'
import { importTrack } from '../api/trackImports.js'
import { login } from '../api/auth.js'
import {
  authenticated,
  authentication,
  deferred,
  importResult,
} from '../test/factories.js'
import { ApiError } from '../utils/errors.js'

vi.mock('../api/trackImports.js', () => ({ importTrack: vi.fn() }))
vi.mock('../api/auth.js', () => ({ login: vi.fn() }))
let pinia, auth, store
const file = (name = 'song.mp3') =>
  new File(['audio'], name, { type: 'audio/mpeg' })
beforeEach(() => {
  vi.resetAllMocks()
  pinia = createPinia()
  setActivePinia(pinia)
  auth = useAuthStore()
  auth.session = authentication('ADMIN')
  store = useTrackImportStore()
  vi.mocked(importTrack).mockImplementation(({ uploadId }) =>
    Promise.resolve(importResult({ uploadId })),
  )
})
afterEach(() => disposePinia(pinia))

it('should_wait_for_manual_start_and_send_original_files_sequentially', async () => {
  const first = file('first.mp3'),
    second = file('second.FLAC')
  const pending = deferred()
  vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
  store.addFiles([first, file('bad.txt'), second])
  expect(store.counts).toMatchObject({ total: 3, waiting: 2, invalid: 1 })
  expect(importTrack).not.toHaveBeenCalled()
  const run = store.start()
  await store.start()
  expect(importTrack).toHaveBeenCalledTimes(1)
  expect(importTrack.mock.calls[0][0].file).toBe(first)
  const progress = importTrack.mock.calls[0][1].onProgress
  progress({ percent: 43, sent: false })
  expect(store.items[0]).toMatchObject({ state: 'sending', progress: 43 })
  progress({ percent: 100, sent: true })
  progress({ percent: 20, sent: false })
  expect(store.items[0]).toMatchObject({ state: 'processing', progress: 100 })
  pending.resolve(importResult())
  await run
  expect(importTrack).toHaveBeenCalledTimes(2)
  expect(importTrack.mock.calls[1][0].file).toBe(second)
  expect(store.items[0].file).toBeNull()
  expect(store.counts.succeeded).toBe(2)
  expect(store.batchState).toBe('completed')
})
it('should_append_remove_unsent_and_finish_current_before_pausing', async () => {
  const pending = deferred()
  vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
  store.addFiles([file('a.mp3'), file('b.mp3')])
  const run = store.start()
  store.removeItem(store.items[0].id)
  expect(store.items).toHaveLength(2)
  store.addFiles([file('c.mp3')])
  store.removeItem(store.items[1].id)
  store.requestPause()
  expect(store.batchState).toBe('pausing')
  pending.resolve(importResult())
  await run
  expect(store.batchState).toBe('paused')
  expect(importTrack).toHaveBeenCalledTimes(1)
  store.addFiles([file('d.mp3')])
  expect(store.batchState).toBe('paused')
  await store.start()
  expect(store.counts.succeeded).toBe(3)
  store.addFiles([file('e.mp3')])
  expect(store.batchState).toBe('idle')
  expect(store.counts.waiting).toBe(1)
})
it.each([
  [413, 'UPLOAD_TOO_LARGE'],
  [415, 'UNSUPPORTED_AUDIO_FORMAT'],
  [422, 'AUDIO_METADATA_INVALID'],
])('should_continue_after_definite_file_rejection_%s', async (status, code) => {
  vi.mocked(importTrack).mockRejectedValueOnce(new ApiError({ status, code }))
  store.addFiles([file(), file('b.mp3')])
  await store.start()
  expect(store.counts).toMatchObject({ failed: 1, succeeded: 1 })
  expect(store.items[0].file).toBeNull()
})
it.each([
  [400, 'VALIDATION_FAILED'],
  [409, 'IMPORT_CONFLICT'],
])('should_pause_after_request_rejection_%s', async (status, code) => {
  vi.mocked(importTrack).mockRejectedValueOnce(new ApiError({ status, code }))
  store.addFiles([file(), file()])
  await store.start()
  expect(store.batchState).toBe('paused')
  expect(store.items[0]).toMatchObject({ state: 'failed', file: null })
  expect(store.blockerId).toBeNull()
  await store.start()
  expect(store.counts.succeeded).toBe(1)
})
it.each([
  [403, 'FORBIDDEN', 'blocked'],
  [429, 'TRACK_IMPORT_RATE_LIMITED', 'blocked'],
  [409, 'IMPORT_IN_PROGRESS', 'uncertain'],
  [503, 'MEDIA_STORAGE_UNAVAILABLE', 'uncertain'],
  [503, 'MEDIA_IMPORT_STORE_UNAVAILABLE', 'uncertain'],
  [503, 'MEDIA_OBJECT_CLEANUP_FAILED', 'uncertain'],
  [0, 'TIMEOUT', 'uncertain'],
  [0, 'NETWORK_ERROR', 'uncertain'],
  [0, 'INVALID_RESPONSE', 'uncertain'],
  [500, 'UNKNOWN', 'uncertain'],
])(
  'should_preserve_recovery_material_for_%s_%s',
  async (status, code, state) => {
    const original = file()
    vi.mocked(importTrack).mockRejectedValueOnce(new ApiError({ status, code }))
    store.addFiles([original, file('next.mp3')])
    await store.start()
    const item = store.items[0],
      key = item.uploadId
    expect(item).toMatchObject({ state, file: original })
    await store.start()
    expect(importTrack).toHaveBeenCalledTimes(1)
    const pending = deferred()
    vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
    const retry = store.retryCurrent()
    await store.retryCurrent()
    expect(importTrack).toHaveBeenLastCalledWith(
      { file: original, uploadId: key },
      expect.any(Object),
    )
    pending.resolve(importResult())
    await retry
    expect(store.batchState).toBe('paused')
    expect(store.blockerId).toBeNull()
    expect(item.file).toBeNull()
    expect(store.counts.waiting).toBe(1)
  },
)
it('should_keep_retry_errors_and_ignore_late_progress_from_previous_attempt', async () => {
  vi.mocked(importTrack).mockRejectedValueOnce(
    new ApiError({ code: 'TIMEOUT' }),
  )
  store.addFiles([file()])
  await store.start()
  const oldProgress = importTrack.mock.calls[0][1].onProgress
  vi.mocked(importTrack).mockRejectedValueOnce(
    new ApiError({ status: 429, code: 'TRACK_IMPORT_RATE_LIMITED' }),
  )
  await store.retryCurrent()
  oldProgress({ percent: 90, sent: false })
  expect(store.items[0].state).toBe('blocked')
  vi.mocked(importTrack).mockRejectedValueOnce(
    new ApiError({ status: 422, code: 'AUDIO_METADATA_INVALID' }),
  )
  await store.retryCurrent()
  expect(store.items[0]).toMatchObject({ state: 'failed', file: null })
  expect(store.batchState).toBe('paused')
})
it.each(['clear', 'replace', 'role'])(
  'should_abort_and_release_old_queue_on_session_%s',
  async (change) => {
    const pending = deferred()
    vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
    store.addFiles([file(), file()])
    const run = store.start()
    const options = importTrack.mock.calls[0][1]
    if (change === 'clear') auth.clearSession()
    if (change === 'replace') auth.session = authentication('ADMIN')
    if (change === 'role') auth.session.user.role = 'USER'
    expect(options.signal.aborted).toBe(true)
    expect(store.items).toEqual([])
    options.onProgress({ percent: 50, sent: false })
    pending.resolve(importResult())
    await run
    expect(store.active).toBe(false)
    expect(store.items).toEqual([])
    expect(importTrack).toHaveBeenCalledTimes(1)
  },
)
it('should_clear_revision_mismatch_even_when_auth_session_object_does_not_change', async () => {
  const pending = deferred()
  vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
  store.addFiles([file()])
  const run = store.start()
  vi.mocked(login).mockRejectedValueOnce(
    new ApiError({ code: 'INVALID_CREDENTIALS' }),
  )
  await expect(auth.authenticate({})).rejects.toThrow()
  pending.resolve(importResult())
  await run
  expect(store.items).toEqual([])
  expect(store.active).toBe(false)
})
it('should_keep_new_batch_when_old_request_finally_settles', async () => {
  const pending = deferred()
  vi.mocked(importTrack).mockReturnValueOnce(pending.promise)
  store.addFiles([file()])
  const oldRun = store.start()
  auth.session = authentication('ADMIN')
  store.addFiles([file('new.mp3')])
  await store.start()
  pending.reject(new ApiError({ code: 'CANCELLED' }))
  await oldRun
  expect(store.counts.succeeded).toBe(1)
  expect(store.items[0].fileName).toBe('new.mp3')
})
it('should_block_uuid_failure_then_retry_with_a_new_key_without_losing_file', async () => {
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
    throw Error('unavailable')
  })
  const original = file()
  store.addFiles([original])
  const id = store.items[0].id
  expect(store.items[0]).toMatchObject({
    state: 'blocked',
    uploadId: null,
    file: original,
  })
  await store.start()
  expect(importTrack).not.toHaveBeenCalled()
  await store.retryCurrent()
  expect(store.items[0]).toMatchObject({ id, state: 'succeeded' })
  uuid.mockRestore()
})
it('should_allow_removing_unsent_blocker_and_reject_actions_without_admin', async () => {
  vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
    throw Error()
  })
  store.addFiles([file(), file('next.mp3')])
  store.removeItem(store.items[0].id)
  expect(store.blockerId).toBeNull()
  await store.start()
  expect(store.counts.succeeded).toBe(1)
  auth.session.user.role = 'USER'
  store.addFiles([file()])
  await store.start()
  await store.retryCurrent()
  store.requestPause()
  store.removeItem('missing')
  expect(store.items).toEqual([])
})
