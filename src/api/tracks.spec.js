import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureAuth, http } from './http.js'
import { getTrackCover, listTracks } from './tracks.js'
import { authentication, trackPageText } from '../test/factories.js'

const query = { q: '', page: 0, size: 20, sort: 'createdAt,desc' }
const originalAdapter = http.defaults.adapter
function respond(data, config, headers = {}, status = 200) {
  return { data, config, headers, status, statusText: 'OK' }
}
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  configureAuth({ getSession: () => authentication(), onUnauthorized: vi.fn() })
})
afterEach(() => {
  http.defaults.adapter = originalAdapter
  configureAuth({ getSession: () => null, onUnauthorized: () => {} })
})

describe('track list API', () => {
  it('should_preserve_long_ids_and_send_published_scope', async () => {
    let request
    http.defaults.adapter = async (config) => {
      request = config
      return respond(trackPageText({ id: '9223372036854775807' }), config)
    }
    const page = await listTracks({ ...query, q: ' 周杰伦 晴天 ' })
    expect(page.items[0].id).toBe('9223372036854775807')
    expect(request.params).toEqual({
      ...query,
      q: ' 周杰伦 晴天 ',
      status: 'PUBLISHED',
    })
    expect(request.headers.get('Authorization')).toMatch(/^Bearer /)
  })
  it.each(['9.223372036854775807e18', '9223372036854775807.0'])(
    'should_preserve_equivalent_long_notation_%s',
    async (id) => {
      http.defaults.adapter = async (config) =>
        respond(trackPageText({ id }), config)
      expect((await listTracks(query)).items[0].id).toBe('9223372036854775807')
    },
  )
  it('should_preserve_large_counts_and_allow_nullable_display_fields', async () => {
    http.defaults.adapter = async (config) =>
      respond(
        trackPageText({
          albumName: null,
          durationMs: null,
          cover: null,
          totalElements: '9223372036854775807',
          totalPages: '461168601842738791',
        }),
        config,
      )
    const page = await listTracks(query)
    expect(page.totalElements).toBe('9223372036854775807')
    expect(page.items[0]).toMatchObject({
      albumName: null,
      durationMs: null,
      cover: null,
    })
  })
  it('should_degrade_unused_or_missing_display_fields', async () => {
    const raw = trackPageText()
      .replace('"albumName":"叶影",', '')
      .replace('"durationMs":245000,', '')
      .replace('"title":"风经过的地方"', '"title":42')
      .replace('"artistName":"林间来信"', '"artistName":null')
      .replace('"cover":null', '"cover":false,"newField":1e1000')
    http.defaults.adapter = async (config) => respond(raw, config)
    expect((await listTracks(query)).items[0]).toMatchObject({
      title: '未命名歌曲',
      artistName: '未知艺术家',
      albumName: null,
      durationMs: null,
      cover: null,
    })
  })
  it.each(['0', '-1', '1.5', '9223372036854775808', '1e1000'])(
    'should_reject_invalid_resource_id_%s',
    async (id) => {
      http.defaults.adapter = async (config) =>
        respond(trackPageText({ id }), config)
      await expect(listTracks(query)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    },
  )
  it.each([
    ['items', 'null'],
    ['page', '-1'],
    ['size', '0'],
    ['totalElements', '-1'],
    ['hasNext', 'null'],
    ['status', '"DRAFT"'],
  ])(
    'should_reject_invalid_pagination_or_scope_%s',
    async (field, replacement) => {
      const raw = trackPageText().replace(
        new RegExp(
          '"' + field + '":(?:\\[[\\s\\S]*?\\]|"[^"]*"|true|false|[-\\d]+)',
        ),
        '"' + field + '":' + replacement,
      )
      http.defaults.adapter = async (config) => respond(raw, config)
      await expect(listTracks(query)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    },
  )
  it('should_accept_empty_out_of_range_pages_and_omit_empty_q', async () => {
    http.defaults.adapter = async (config) => {
      expect(config.params).not.toHaveProperty('q')
      return respond(
        trackPageText({
          items: [],
          page: 2,
          totalElements: '1',
          totalPages: '1',
          hasNext: false,
        }),
        config,
      )
    }
    expect((await listTracks({ ...query, page: 2 })).items).toEqual([])
  })
  it('should_forward_signals_and_convert_problem_details', async () => {
    const controller = new AbortController()
    http.defaults.adapter = async (config) => {
      expect(config.signal).toBe(controller.signal)
      throw {
        config,
        response: {
          status: 429,
          data: '{"code":"TRACK_SEARCH_RATE_LIMITED"}',
          headers: { 'retry-after': '15' },
        },
      }
    }
    await expect(
      listTracks(query, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: 'TRACK_SEARCH_RATE_LIMITED',
      retryAfter: 15,
    })
  })
  it('should_reject_malformed_success_json_and_unexpected_status', async () => {
    http.defaults.adapter = async (config) => respond('{', config)
    await expect(listTracks(query)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    http.defaults.adapter = async (config) => respond('', config, {}, 204)
    await expect(listTracks(query)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})

describe('protected cover API', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'should_load_%s_with_bearer_from_the_known_endpoint',
    async (contentType) => {
      const controller = new AbortController()
      http.defaults.adapter = async (config) => {
        expect(config.url).toBe('/tracks/9223372036854775807/cover')
        expect(config.signal).toBe(controller.signal)
        expect(config.headers.get('Authorization')).toMatch(/^Bearer /)
        return respond(new Uint8Array([1, 2, 3]).buffer, config, {
          'content-type': contentType,
        })
      }
      const blob = await getTrackCover('9223372036854775807', {
        signal: controller.signal,
      })
      expect(blob.type).toBe(contentType)
      expect(blob.size).toBe(3)
    },
  )
  it.each([
    [404, 'COVER_NOT_FOUND'],
    [502, 'COVER_STORAGE_INCONSISTENT'],
    [503, 'MEDIA_STORAGE_UNAVAILABLE'],
  ])('should_decode_binary_problem_%s', async (status, code) => {
    http.defaults.adapter = async (config) => {
      throw {
        config,
        response: {
          status,
          data: new TextEncoder().encode(JSON.stringify({ code })).buffer,
          headers: { 'content-type': 'application/problem+json' },
        },
      }
    }
    await expect(getTrackCover('42')).rejects.toMatchObject({ status, code })
  })
  it('should_handle_empty_binary_401_using_the_session_boundary', async () => {
    const session = authentication()
    const onUnauthorized = vi.fn()
    configureAuth({ getSession: () => session, onUnauthorized })
    http.defaults.adapter = async (config) => {
      throw {
        config,
        response: { status: 401, data: new ArrayBuffer(0), headers: {} },
      }
    }
    await expect(getTrackCover('42')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
  it.each(['0', 'bad', '9223372036854775808'])(
    'should_reject_invalid_cover_id_%s_before_requesting',
    async (id) => {
      http.defaults.adapter = vi.fn()
      await expect(getTrackCover(id)).rejects.toMatchObject({
        code: 'CLIENT_ERROR',
      })
      expect(http.defaults.adapter).not.toHaveBeenCalled()
    },
  )
  it('should_reject_non_image_success_and_empty_images', async () => {
    http.defaults.adapter = async (config) =>
      respond(new ArrayBuffer(1), config, { 'content-type': 'text/html' })
    await expect(getTrackCover('42')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
    http.defaults.adapter = async (config) =>
      respond(new ArrayBuffer(0), config, { 'content-type': 'image/png' })
    await expect(getTrackCover('42')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
