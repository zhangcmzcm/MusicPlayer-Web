import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  parseLibraryQuery,
  toLibraryQuery,
  validateTrackSearch,
} from './trackList.js'

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
