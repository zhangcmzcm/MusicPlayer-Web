import { isLosslessNumber, parse, splitNumber } from 'lossless-json'
import { http } from './http.js'
import { ApiError } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'

const MAX_LONG = 9223372036854775807n
const MIN_LONG = -9223372036854775808n

function invalidResponse() {
  const error = new ApiError({ code: 'INVALID_RESPONSE' })
  reportError(error)
  return error
}

function longString(value, minimum = 0n, maximum = MAX_LONG) {
  let raw
  if (isLosslessNumber(value)) raw = value.toString()
  else if (typeof value === 'number' && Number.isSafeInteger(value))
    raw = String(value)
  else throw invalidResponse()
  const { sign, digits, exponent } = splitNumber(raw)
  if (exponent > 18 || exponent < digits.length - 1) throw invalidResponse()
  const integer = BigInt(
    sign + digits + '0'.repeat(exponent + 1 - digits.length),
  )
  if (integer < minimum || integer > maximum) throw invalidResponse()
  return integer.toString()
}

function optionalLong(value) {
  if (value === null || value === undefined) return null
  try {
    return longString(value, MIN_LONG)
  } catch {
    return null
  }
}

function parseTrackJson(data, _headers, status) {
  if (typeof data !== 'string' || data === '') return data
  try {
    return parse(data)
  } catch {
    if (status >= 400) return {}
    return null
  }
}

function displayText(value, fallback) {
  return typeof value === 'string' && value.length ? value : fallback
}

function normalizeTrack(item) {
  const id = longString(item?.id, 1n)
  if (item.status !== 'PUBLISHED') throw invalidResponse()
  const cover =
    item.cover && typeof item.cover === 'object' && !Array.isArray(item.cover)
      ? {
          url: item.cover.url,
          contentType: item.cover.contentType,
          sizeBytes: optionalLong(item.cover.sizeBytes),
        }
      : null
  return {
    id,
    title: displayText(item.title, '未命名歌曲'),
    artistName: displayText(item.artistName, '未知艺术家'),
    albumName: displayText(item.albumName, null),
    durationMs: optionalLong(item.durationMs),
    cover,
    status: item.status,
  }
}

export async function listTracks(query, { signal } = {}) {
  const params = {
    page: query.page,
    size: query.size,
    sort: query.sort,
    status: 'PUBLISHED',
  }
  if (query.q !== '') params.q = query.q
  const response = await http.get('/tracks', {
    params,
    signal,
    responseType: 'text',
    transformResponse: [parseTrackJson],
  })
  const data = response.data
  if (
    response.status !== 200 ||
    !Array.isArray(data?.items) ||
    typeof data.hasNext !== 'boolean'
  )
    throw invalidResponse()
  const page = Number(longString(data.page, 0n, 2147483647n))
  const size = Number(longString(data.size, 1n, 100n))
  if (page !== query.page || size !== query.size) throw invalidResponse()
  return {
    items: data.items.map(normalizeTrack),
    page,
    size,
    totalElements: longString(data.totalElements),
    totalPages: longString(data.totalPages),
    hasNext: data.hasNext,
  }
}

function decodeCoverError(data, _headers, status) {
  if (status < 400) return data
  if (
    !(data instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(data) &&
    typeof data !== 'string'
  )
    return data
  try {
    return JSON.parse(
      typeof data === 'string' ? data : new TextDecoder().decode(data),
    )
  } catch {
    return {}
  }
}

export async function getTrackCover(trackId, { signal } = {}) {
  if (
    typeof trackId !== 'string' ||
    !/^\d{1,19}$/.test(trackId) ||
    BigInt(trackId) < 1n ||
    BigInt(trackId) > MAX_LONG
  ) {
    throw new ApiError({ code: 'CLIENT_ERROR' })
  }
  const response = await http.get(`/tracks/${trackId}/cover`, {
    signal,
    responseType: 'arraybuffer',
    transformResponse: [decodeCoverError],
  })
  const contentType = String(response.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (
    response.status !== 200 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
  )
    throw invalidResponse()
  const blob = new Blob([response.data], { type: contentType })
  if (!blob.size) throw invalidResponse()
  return blob
}
