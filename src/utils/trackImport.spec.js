import { expect, it } from 'vitest'
import {
  validateImportFile,
  formatImportFileSize,
  normalizeImportWarnings,
  getImportProgress,
} from './trackImport.js'

it.each(['song.mp3', 'song.MP3', 'song.flac', 'song.FLAC'])(
  'should_accept_supported_file_%s',
  (name) => {
    const file = new File([], name)
    expect(validateImportFile(file)).toBeNull()
    Object.defineProperty(file, 'size', {
      value: 209715200,
      configurable: true,
    })
    expect(validateImportFile(file)).toBeNull()
    Object.defineProperty(file, 'size', { value: 209715201 })
    expect(validateImportFile(file)).toContain('200 MiB')
  },
)
it.each([new File(['a'], 'song.wav'), new File(['a'], 'song'), null])(
  'should_explain_invalid_selection_%s',
  (file) => {
    expect(validateImportFile(file)).toEqual(expect.any(String))
  },
)
it.each([
  [0, '0 B'],
  [1023, '1023 B'],
  [1024, '1.0 KiB'],
  [1048576, '1.0 MiB'],
  [209715200, '200.0 MiB'],
])('should_format_file_size_%s', (size, text) => {
  expect(formatImportFileSize(size)).toBe(text)
})
it('should_normalize_known_and_unknown_warnings_without_rejecting_success', () => {
  expect(normalizeImportWarnings([])).toEqual([])
  expect(
    normalizeImportWarnings([
      'COVER_MISSING',
      'COVER_MISSING',
      'future',
      'other',
    ]),
  ).toEqual(['未找到内嵌封面。', '另有导入提示，请核对歌曲信息。'])
  for (const warning of [
    'TITLE_FALLBACK',
    'ARTIST_FALLBACK',
    'COVER_TOO_LARGE',
    'TITLE_TRUNCATED',
    'ARTIST_TRUNCATED',
    'ALBUM_TRUNCATED',
    'TRACK_NUMBER_INVALID',
    'DISC_NUMBER_INVALID',
  ]) {
    expect(normalizeImportWarnings([warning])[0]).not.toContain('另有')
  }
})
it.each([undefined, null, {}, 'COVER_MISSING', [null]])(
  'should_degrade_invalid_warning_shape_%j',
  (value) => {
    expect(normalizeImportWarnings(value)).toEqual([
      '导入提示信息读取异常，请核对歌曲信息。',
    ])
  },
)
it.each([
  [
    { loaded: 5, total: 10 },
    { percent: 50, sent: false },
  ],
  [
    { loaded: 999, total: 1000 },
    { percent: 99, sent: false },
  ],
  [
    { loaded: 1000, total: 1000 },
    { percent: 100, sent: true },
  ],
  [
    { loaded: 1100, total: 1000 },
    { percent: 100, sent: true },
  ],
  [{ loaded: 5 }, { percent: null, sent: false }],
  [
    { loaded: 0, total: 0 },
    { percent: null, sent: false },
  ],
  [
    { loaded: -1, total: 10 },
    { percent: null, sent: false },
  ],
  [
    { loaded: 1, total: Infinity },
    { percent: null, sent: false },
  ],
])('should_normalize_transfer_progress_%j', (event, expected) => {
  expect(getImportProgress(event)).toEqual(expected)
})
