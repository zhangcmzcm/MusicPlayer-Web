import { ApiError } from './errors.js'

export const DEFAULT_LIBRARY_QUERY = Object.freeze({
  q: '',
  page: 0,
  size: 20,
  sort: 'createdAt,desc',
})

export const DEFAULT_MANAGEMENT_QUERY = DEFAULT_LIBRARY_QUERY

export const TRACK_STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'ARCHIVED', label: '已归档' },
]

export function formatTrackStatus(value) {
  return (
    TRACK_STATUS_OPTIONS.find((option) => option.value === value)?.label ||
    '未知状态'
  )
}

export const LIBRARY_SORT_OPTIONS = [
  { value: 'createdAt,desc', label: '最近加入' },
  { value: 'createdAt,asc', label: '最早加入' },
  { value: 'title,asc', label: '歌名升序' },
  { value: 'title,desc', label: '歌名降序' },
  { value: 'artistName,asc', label: '艺术家升序' },
  { value: 'artistName,desc', label: '艺术家降序' },
  { value: 'id,desc', label: '歌曲编号降序' },
  { value: 'id,asc', label: '歌曲编号升序' },
]

export function validateTrackSearch(raw) {
  if (typeof raw !== 'string') return '请输入有效的关键词。'
  if (raw === '') return null
  if ([...raw].length > 100) return '关键词最多 100 个字符。'
  const words = raw.split(/\p{White_Space}+/u).filter(Boolean)
  if (!words.length) return '请输入关键词，或清空后浏览曲库。'
  if (words.length > 5) return '关键词最多包含 5 个词。'
  return null
}

function queryInteger(value, fallback) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value)) return NaN
  return Number(value)
}

export function parseLibraryQuery(routeQuery) {
  const q = routeQuery.q === undefined ? '' : routeQuery.q
  const page = queryInteger(routeQuery.page, 0)
  const size = queryInteger(routeQuery.size, 20)
  const sort =
    routeQuery.sort === undefined ? DEFAULT_LIBRARY_QUERY.sort : routeQuery.sort
  const invalid =
    validateTrackSearch(q) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > 100 ||
    page * size > 10000 ||
    !LIBRARY_SORT_OPTIONS.some((option) => option.value === sort)
  if (invalid)
    return {
      query: null,
      error: new ApiError({ code: 'INVALID_LIBRARY_QUERY' }),
    }
  return { query: { q, page, size, sort }, error: null }
}

export function toLibraryQuery(query) {
  const result = {}
  if (query.q !== '') result.q = query.q
  if (query.page !== 0) result.page = String(query.page)
  if (query.size !== 20) result.size = String(query.size)
  if (query.sort !== DEFAULT_LIBRARY_QUERY.sort) result.sort = query.sort
  return result
}

export function parseManagementQuery(routeQuery) {
  const parsed = parseLibraryQuery(routeQuery)
  const status = routeQuery.status
  if (
    parsed.error ||
    (status !== undefined &&
      !TRACK_STATUS_OPTIONS.some((option) => option.value === status))
  )
    return {
      query: null,
      error: new ApiError({ code: 'INVALID_MANAGEMENT_QUERY' }),
    }
  const query = { ...parsed.query }
  if (status !== undefined) query.status = status
  return { query, error: null }
}

export function toManagementQuery(query) {
  const result = toLibraryQuery(query)
  if (TRACK_STATUS_OPTIONS.some((option) => option.value === query.status))
    result.status = query.status
  return result
}

export function managementReturnTarget(routeQuery, { drafts = false } = {}) {
  const query = {
    ...(parseManagementQuery(routeQuery).query || DEFAULT_MANAGEMENT_QUERY),
  }
  if (drafts) Object.assign(query, { q: '', page: 0, status: 'DRAFT' })
  return { name: 'track-management', query: toManagementQuery(query) }
}

export function formatDuration(milliseconds) {
  if (typeof milliseconds !== 'string' || !/^\d+$/.test(milliseconds))
    return '--:--'
  const seconds = BigInt(milliseconds) / 1000n
  return `${seconds / 60n}:${String(seconds % 60n).padStart(2, '0')}`
}
