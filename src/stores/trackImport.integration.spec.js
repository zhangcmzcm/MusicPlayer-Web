import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { http, configureAuth } from '../api/http.js'
import { login } from '../api/auth.js'
import { useAuthStore } from './auth.js'
import { useTrackImportStore } from './trackImport.js'
import {
  authenticated,
  authentication,
  deferred,
  importResponseText,
} from '../test/factories.js'
import { ApiError } from '../utils/errors.js'

vi.mock('../api/auth.js', () => ({ login: vi.fn() }))
let pinia, auth, store, adapter
const file = () => new File(['audio'], 'song.mp3', { type: 'audio/mpeg' })
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  auth = useAuthStore()
  auth.session = authentication('ADMIN')
  store = useTrackImportStore()
  adapter = http.defaults.adapter
  configureAuth({
    getSession: () => auth.session,
    getSessionRevision: auth.getSessionRevision,
    onUnauthorized: () => auth.clearSession(),
  })
})
afterEach(() => {
  http.defaults.adapter = adapter
  configureAuth({ getSession: () => null, onUnauthorized: () => {} })
  disposePinia(pinia)
  vi.restoreAllMocks()
})
it('should_clear_current_401_but_keep_same_token_new_session_after_old_401', async () => {
  const old = deferred(),
    entered = deferred()
  http.defaults.adapter = vi.fn((config) => {
    entered.resolve(config)
    return old.promise
  })
  store.addFiles([file()])
  const run = store.start()
  const config = await entered.promise
  auth.session = authentication('ADMIN')
  store.addFiles([file()])
  old.reject({
    config,
    response: { status: 401, data: { code: 'INVALID_TOKEN' } },
  })
  await run
  expect(auth.isAuthenticated).toBe(true)
  expect(store.items).toHaveLength(1)
  http.defaults.adapter = (request) =>
    Promise.reject({
      config: request,
      response: { status: 401, data: { code: 'INVALID_TOKEN' } },
    })
  await store.start()
  expect(auth.session).toBeNull()
  expect(store.items).toEqual([])
})
it('should_abort_before_adapter_when_new_session_is_created_during_interceptor_wait', async () => {
  const entered = deferred(),
    gate = deferred()
  const interceptor = http.interceptors.request.use(async (config) => {
    entered.resolve()
    await gate.promise
    return config
  })
  const dispatch = vi.fn()
  http.defaults.adapter = dispatch
  try {
    store.addFiles([file()])
    const run = store.start()
    await entered.promise
    vi.mocked(login).mockResolvedValueOnce(authenticated('ADMIN'))
    await auth.authenticate({})
    gate.resolve()
    await run
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.items).toEqual([])
    expect(auth.isAuthenticated).toBe(true)
  } finally {
    gate.resolve()
    http.interceptors.request.eject(interceptor)
  }
})
it('should_preserve_403_and_429_then_replay_same_file_and_key_through_http', async () => {
  const requests = []
  let attempt = 0
  http.defaults.adapter = async (config) => {
    requests.push(config)
    attempt++
    if (attempt < 3)
      throw {
        config,
        response: {
          status: attempt === 1 ? 403 : 429,
          data: {
            code: attempt === 1 ? 'FORBIDDEN' : 'TRACK_IMPORT_RATE_LIMITED',
          },
          headers: { 'retry-after': '12' },
        },
      }
    return {
      config,
      status: 200,
      headers: {},
      data: importResponseText({ uploadId: config.data.get('uploadId') }),
    }
  }
  store.addFiles([file()])
  await store.start()
  expect(store.items[0].state).toBe('blocked')
  await store.retryCurrent()
  expect(store.items[0].error.retryAfter).toBe(12)
  await store.retryCurrent()
  expect(store.items[0].state).toBe('succeeded')
  expect(
    new Set(requests.map((request) => request.data.get('uploadId'))).size,
  ).toBe(1)
  expect(
    new Set(
      await Promise.all(
        requests.map((request) => request.data.get('file').text()),
      ),
    ),
  ).toEqual(new Set(['audio']))
  expect(auth.isAuthenticated).toBe(true)
})
it('should_clear_same_object_revision_mismatch_after_real_http_result', async () => {
  const pending = deferred(),
    entered = deferred()
  http.defaults.adapter = (config) => {
    entered.resolve(config)
    return pending.promise
  }
  store.addFiles([file()])
  const run = store.start()
  const config = await entered.promise
  vi.mocked(login).mockRejectedValueOnce(
    new ApiError({ code: 'INVALID_CREDENTIALS' }),
  )
  await expect(auth.authenticate({})).rejects.toThrow()
  pending.resolve({
    config,
    status: 201,
    headers: {},
    data: importResponseText({ uploadId: config.data.get('uploadId') }),
  })
  await run
  expect(store.items).toEqual([])
  expect(store.active).toBe(false)
})
