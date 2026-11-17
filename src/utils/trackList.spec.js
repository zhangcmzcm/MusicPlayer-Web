import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGEMENT_QUERY,
  formatTrackStatus,
  formatDuration,
  parseManagementQuery,
  parseLibraryQuery,
  toManagementQuery,
  toLibraryQuery,
  validateTrackSearch,
} from './trackList.js'

describe('management queries', () => {
  it('should_parse_and_serialize_management_status', () => {
    expect(parseManagementQuery({})).toEqual({
      query: DEFAULT_MANAGEMENT_QUERY,
      error: null,
    })
    const { query, error } = parseManagementQuery({
      status: 'DRAFT',
      q: ' 林间 ',
      page: '01',
    })
    expect(error).toBeNull()
    expect(query).toEqual({
      ...DEFAULT_MANAGEMENT_QUERY,
      status: 'DRAFT',
      q: ' 林间 ',
      page: 1,
    })
    expect(toManagementQuery(query)).toEqual({
      status: 'DRAFT',
      q: ' 林间 ',
      page: '1',
    })
    expect(toManagementQuery(DEFAULT_MANAGEMENT_QUERY)).toEqual({})
  })
  it.each(['DRAFT', 'PUBLISHED', 'ARCHIVED'])(
    'should_accept_management_status_%s',
    (status) => {
      const { query } = parseManagementQuery({ status })
      expect(toManagementQuery(query)).toEqual({ status })
    },
  )
  it.each([['DRAFT', 'ARCHIVED'], null, '', 'ALL', 'DELETED', 'draft'])(
    'should_reject_invalid_management_status_%j',
    (status) => {
      expect(parseManagementQuery({ status })).toMatchObject({
        query: null,
        error: { code: 'INVALID_MANAGEMENT_QUERY' },
      })
    },
  )
  it.each([
    { q: '😀'.repeat(100) },
    { q: 'a\u3000a\u00a0a\ta\na' },
    { page: '+100', size: '0100' },
  ])('should_accept_management_boundaries_%j', (query) => {
    expect(parseManagementQuery(query).error).toBeNull()
  })
  it.each([
    { q: '😀'.repeat(101) },
    { q: 'a a a a a a' },
    { page: '101', size: '100' },
    { q: null },
    { sort: ['title,asc'] },
  ])('should_recover_invalid_management_base_query_%j', (query) => {
    expect(parseManagementQuery(query)).toMatchObject({
      query: null,
      error: { code: 'INVALID_MANAGEMENT_QUERY' },
    })
  })
  it.each([
    ['DRAFT', '草稿'],
    ['PUBLISHED', '已发布'],
    ['ARCHIVED', '已归档'],
    [null, '未知状态'],
    [undefined, '未知状态'],
    ['OTHER', '未知状态'],
  ])('should_format_status_%s', (value, label) => {
    expect(formatTrackStatus(value)).toBe(label)
  })
})

describe('library queries', () => {
  it.each([
    '',
    '晴',
    ' 周杰伦 晴天 ',
    'a\u3000b\u00a0c\td\ne',
    '😀'.repeat(100),
  ])('should_accept_contract_search_%s', (raw) =>
    expect(validateTrackSearch(raw)).toBeNull(),
  )
  it.each([' \u3000\t', '😀'.repeat(101), 'a a a a a a'])(
    'should_reject_invalid_search_%s',
    (raw) => expect(validateTrackSearch(raw)).toEqual(expect.any(String)),
  )
  it('should_use_the_confirmed_default_query', () => {
    expect(parseLibraryQuery({})).toEqual({
      query: { q: '', page: 0, size: 20, sort: 'createdAt,desc' },
      error: null,
    })
  })
  it.each([
    { page: '100', size: '100' },
    { page: '10000', size: '1' },
    { page: '+5', size: '+20' },
    { q: ' 林间 ', sort: 'title,asc', page: '01' },
  ])('should_accept_legal_query_%j', (routeQuery) => {
    expect(parseLibraryQuery(routeQuery).error).toBeNull()
  })
  it.each([
    { page: '101', size: '100' },
    { page: '501', size: '20' },
    { page: '-1' },
    { page: '1.5' },
    { size: '0' },
    { size: '101' },
    { size: ['20', '20'] },
    { q: ['a', 'b'] },
    { sort: 'albumName,asc' },
    { sort: 'title,ASC' },
    { q: ' \u00a0 ' },
    { page: '' },
  ])('should_recover_from_invalid_url_query_%j', (routeQuery) => {
    expect(parseLibraryQuery(routeQuery)).toMatchObject({
      query: null,
      error: { code: 'INVALID_LIBRARY_QUERY' },
    })
  })
  it('should_preserve_raw_keywords_and_only_serialize_supported_fields', () => {
    const { query } = parseLibraryQuery({
      q: ' 林间 ',
      status: 'DRAFT',
      extra: 'ignored',
    })
    expect(toLibraryQuery(query)).toEqual({ q: ' 林间 ' })
    expect(
      toLibraryQuery({ q: '', page: 2, size: 50, sort: 'title,asc' }),
    ).toEqual({
      page: '2',
      size: '50',
      sort: 'title,asc',
    })
  })
  it.each([
    [null, '--:--'],
    [undefined, '--:--'],
    ['-1', '--:--'],
    ['abc', '--:--'],
    ['0', '0:00'],
    ['245000', '4:05'],
    ['9223372036854775807', '153722867280912:55'],
  ])('should_format_duration_%s_as_%s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected)
  })
})
