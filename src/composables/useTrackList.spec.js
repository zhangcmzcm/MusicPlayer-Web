import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { listTracks } from '../api/tracks.js'
import { useAuthStore } from '../stores/auth.js'
import { authentication, deferred, trackPage } from '../test/factories.js'
import { ApiError } from '../utils/errors.js'
import { DEFAULT_LIBRARY_QUERY } from '../utils/trackList.js'
import { useTrackList } from './useTrackList.js'

vi.mock('../api/tracks.js', () => ({ listTracks: vi.fn() }))
let scope
function createFlow(initial = { ...DEFAULT_LIBRARY_QUERY }) {
  const query = ref(initial)
  scope = effectScope()
  const flow = scope.run(() => useTrackList(query))
  return { query, flow }
}
beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().session = authentication()
  listTracks.mockReset()
})
afterEach(() => scope?.stop())

describe('track list lifecycle', () => {
  it('should_load_the_current_query_and_expose_pending', async () => {
    const gate = deferred()
    listTracks.mockReturnValue(gate.promise)
    const { flow } = createFlow()
    expect(flow.pending.value).toBe(true)
    expect(listTracks).toHaveBeenCalledWith(DEFAULT_LIBRARY_QUERY, {
      signal: expect.any(AbortSignal),
    })
    gate.resolve(trackPage())
    await flushPromises()
    expect(flow.pending.value).toBe(false)
    expect(flow.page.value.items[0].id).toBe('42')
  })
  it('should_ignore_a_late_query_and_keep_new_pending_state', async () => {
    const first = deferred(),
      second = deferred()
    listTracks
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { query, flow } = createFlow()
    const firstSignal = listTracks.mock.calls[0][1].signal
    query.value = { ...query.value, q: '林间' }
    await nextTick()
    first.resolve(trackPage({ id: '1' }))
    await flushPromises()
    expect(firstSignal.aborted).toBe(true)
    expect(flow.pending.value).toBe(true)
    expect(flow.page.value).toBeNull()
    second.resolve(trackPage({ id: '2' }))
    await flushPromises()
    expect(flow.page.value.items[0].id).toBe('2')
  })
  it('should_keep_the_new_query_when_the_old_result_arrives_last', async () => {
    const first = deferred(),
      second = deferred()
    listTracks
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { query, flow } = createFlow()
    query.value = { ...query.value, page: 1 }
    await nextTick()
    second.resolve(trackPage({ id: '2', page: 1 }))
    await flushPromises()
    first.resolve(trackPage({ id: '1' }))
    await flushPromises()
    expect(flow.page.value.items[0].id).toBe('2')
  })
  it('should_cancel_on_dispose_and_merge_duplicate_refreshes', async () => {
    const gate = deferred()
    listTracks.mockReturnValue(gate.promise)
    const { flow } = createFlow()
    flow.retry()
    expect(listTracks).toHaveBeenCalledTimes(1)
    const signal = listTracks.mock.calls[0][1].signal
    scope.stop()
    gate.resolve(trackPage())
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(flow.page.value).toBeNull()
  })
  it('should_ignore_old_session_results_and_load_the_new_session', async () => {
    const first = deferred()
    listTracks
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(trackPage({ id: '2' }))
    const { flow } = createFlow()
    useAuthStore().clearSession()
    useAuthStore().session = authentication('ADMIN')
    await flushPromises()
    first.reject(new ApiError({ code: 'NETWORK_ERROR' }))
    await flushPromises()
    expect(flow.page.value.items[0].id).toBe('2')
    expect(flow.error.value).toBeNull()
  })
  it.each(['NETWORK_ERROR', 'TIMEOUT', 'TRACK_STORE_UNAVAILABLE'])(
    'should_allow_retry_after_%s',
    async (code) => {
      listTracks
        .mockRejectedValueOnce(new ApiError({ code }))
        .mockResolvedValueOnce(trackPage())
      const { flow } = createFlow()
      await flushPromises()
      expect(flow.error.value.code).toBe(code)
      await flow.retry()
      expect(flow.page.value.items[0].id).toBe('42')
      expect(flow.error.value).toBeNull()
    },
  )
  it('should_treat_cancelled_requests_silently', async () => {
    listTracks.mockRejectedValue(new ApiError({ code: 'CANCELLED' }))
    const { flow } = createFlow()
    await flushPromises()
    expect(flow.error.value).toBeNull()
    expect(flow.pending.value).toBe(false)
  })
  it('should_allow_plain_list_while_search_is_limited_and_require_manual_retry', async () => {
    vi.useFakeTimers()
    listTracks
      .mockRejectedValueOnce(
        new ApiError({
          code: 'TRACK_SEARCH_RATE_LIMITED',
          status: 429,
          retryAfter: 2,
        }),
      )
      .mockResolvedValue(trackPage())
    const { query, flow } = createFlow({ ...DEFAULT_LIBRARY_QUERY, q: '林间' })
    await flushPromises()
    expect(flow.retryRemaining.value).toBe(2)
    query.value = { ...query.value, sort: 'title,asc' }
    await nextTick()
    expect(listTracks).toHaveBeenCalledTimes(1)
    query.value = { ...query.value, q: '' }
    await flushPromises()
    expect(listTracks).toHaveBeenCalledTimes(2)
    expect(flow.error.value).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(flow.retryRemaining.value).toBe(0)
    expect(listTracks).toHaveBeenCalledTimes(2)
    query.value = { ...query.value, q: '林间' }
    await flushPromises()
    expect(listTracks).toHaveBeenCalledTimes(3)
  })
  it('should_not_load_invalid_queries_or_anonymous_sessions', async () => {
    const { query, flow } = createFlow(null)
    expect(listTracks).not.toHaveBeenCalled()
    useAuthStore().clearSession()
    query.value = { ...DEFAULT_LIBRARY_QUERY }
    await nextTick()
    expect(listTracks).not.toHaveBeenCalled()
    expect(flow.page.value).toBeNull()
  })
})
