import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureAuth, http } from './http.js'
import { importTrack } from './trackImports.js'
import {
  authentication,
  importResponse,
  importResponseText,
} from '../test/factories.js'

const uploadId = '36bd81f4-2fa2-4d1c-a7c3-b6423690a3fa'
const file = () =>
  new File(['audio-fixture'], 'song.mp3', { type: 'audio/mpeg' })
const originalAdapter = http.defaults.adapter
function respond(data, config, status = 201) {
  return { data, config, headers: {}, status, statusText: 'OK' }
}
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  configureAuth({
    getSession: () => authentication('ADMIN'),
    onUnauthorized: vi.fn(),
  })
})
afterEach(() => {
  http.defaults.adapter = originalAdapter
  configureAuth({ getSession: () => null, onUnauthorized: () => {} })
})
it.each([200, 201])(
  'should_send_one_file_with_import_budget_and_accept_%s',
  async (status) => {
    let request
    http.defaults.adapter = async (config) => {
      request = config
      return respond(importResponseText({ uploadId }), config, status)
    }
    const source = file()
    const controller = new AbortController()
    const progress = vi.fn()
    const result = await importTrack(
      { file: source, uploadId },
      { signal: controller.signal, onProgress: progress },
    )
    expect(request.url).toBe('/track-imports')
    expect(request.timeout).toBe(600000)
    expect(request.signal).toBe(controller.signal)
    expect([...request.data.keys()].sort()).toEqual(['file', 'uploadId'])
    expect(request.data.get('uploadId')).toBe(uploadId)
    expect(request.data.get('file')).toMatchObject({
      name: source.name,
      type: source.type,
      size: source.size,
    })
    expect(await request.data.get('file').text()).toBe('audio-fixture')
    expect(request.headers.get('Authorization')).toMatch(/^Bearer /)
    request.onUploadProgress({ loaded: 5, total: 10 })
    expect(progress).toHaveBeenCalledWith({ percent: 50, sent: false })
    expect(result).toMatchObject({
      status: 'READY',
      uploadId,
      importId: '18',
      track: { id: '42' },
      warnings: [],
    })
  },
)
it.each([
  '9223372036854775807',
  '9.223372036854775807e18',
  '9223372036854775807.0',
])('should_preserve_import_long_%s_and_nullable_cover', async (id) => {
  http.defaults.adapter = async (config) =>
    respond(
      importResponseText({
        track: { ...importResponse().track, id },
        metadataWarnings: ['COVER_MISSING'],
      }),
      config,
    )
  const result = await importTrack({ file: file(), uploadId })
  expect(result.track.id).toBe('9223372036854775807')
  expect(result.warnings).toEqual(['未找到内嵌封面。'])
})
it('should_accept_asset_cover_and_degrade_unused_display_fields', async () => {
  const body = JSON.parse(importResponseText())
  delete body.importId
  delete body.track.title
  body.track.artistName = null
  body.track.cover = {
    id: 52,
    contentType: 'image/jpeg',
    sizeBytes: 20,
    sha256: 'a'.repeat(64),
  }
  body.extra = 'ignored'
  body.metadataWarnings = null
  http.defaults.adapter = async (config) =>
    respond(JSON.stringify(body), config)
  const result = await importTrack({ file: file(), uploadId })
  expect(result).toMatchObject({
    importId: null,
    track: { title: '未命名歌曲', artistName: '未知艺术家' },
    warnings: ['导入提示信息读取异常，请核对歌曲信息。'],
  })
})
it.each(['status', 'uploadId', 'track'])(
  'should_reject_missing_critical_field_%s',
  async (field) => {
    const body = JSON.parse(importResponseText())
    delete body[field]
    http.defaults.adapter = async (config) =>
      respond(JSON.stringify(body), config)
    await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    )
  },
)
it.each([null, '42', 0, -1, 1.5, {}, []])(
  'should_reject_invalid_import_track_id_%j',
  async (id) => {
    const body = JSON.parse(importResponseText())
    body.track.id = id
    http.defaults.adapter = async (config) =>
      respond(JSON.stringify(body), config)
    await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    )
  },
)
it.each([
  { status: 'PROCESSING' },
  { uploadId: '8f14e45f-ceea-467f-a1d7-1b0a4b8f8f6c' },
  { track: null },
])('should_reject_unconfirmed_result_%j', async (fields) => {
  http.defaults.adapter = async (config) =>
    respond(importResponseText(fields), config)
  await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  })
})
it('should_reject_malformed_success_and_unexpected_http_status', async () => {
  http.defaults.adapter = async (config) => respond('{', config)
  await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  })
  http.defaults.adapter = async (config) => respond('', config, 204)
  await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  })
})
it.each(['ECONNABORTED', 'ETIMEDOUT'])(
  'should_convert_import_timeout_%s',
  async (code) => {
    http.defaults.adapter = async (config) => {
      throw { config, code }
    }
    await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject(
      { code: 'TIMEOUT' },
    )
  },
)
it('should_preserve_business_errors_and_silently_convert_cancellation', async () => {
  http.defaults.adapter = async (config) => {
    throw {
      config,
      response: {
        status: 409,
        data: '{"code":"IMPORT_IN_PROGRESS"}',
        headers: {},
      },
    }
  }
  await expect(importTrack({ file: file(), uploadId })).rejects.toMatchObject({
    code: 'IMPORT_IN_PROGRESS',
    status: 409,
  })
  const controller = new AbortController()
  controller.abort()
  await expect(
    importTrack({ file: file(), uploadId }, { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'CANCELLED' })
})
