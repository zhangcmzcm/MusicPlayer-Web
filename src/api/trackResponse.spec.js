import { expect, it, vi } from 'vitest'
import { parse } from 'lossless-json'
import { longString, optionalLong, parseTrackJson } from './trackResponse.js'

vi.spyOn(console, 'warn').mockImplementation(() => {})
it.each(['9223372036854775807', '42.0', '4.2e1', '0'])(
  'should_preserve_integer_%s',
  (value) => {
    expect(longString(parse(value))).toBe(
      BigInt(Number(value) === 42 ? 42 : value).toString(),
    )
  },
)
it.each(['9223372036854775808', '-1', '0.1', '1e20', '1e-2'])(
  'should_reject_invalid_long_%s',
  (value) => {
    expect(() => longString(parse(value))).toThrow()
  },
)
it.each(['42', null, undefined, {}, [], Number.MAX_SAFE_INTEGER + 1])(
  'should_reject_non_numeric_or_unsafe_input',
  (value) => {
    expect(() => longString(value)).toThrow()
  },
)
it('should_degrade_optional_display_numbers_and_parse_invalid_json_by_status', () => {
  expect(optionalLong(null)).toBeNull()
  expect(optionalLong(undefined)).toBeNull()
  expect(optionalLong('42')).toBeNull()
  expect(optionalLong(parse('-9223372036854775808'))).toBe(
    '-9223372036854775808',
  )
  expect(parseTrackJson('', {}, 200)).toBe('')
  expect(parseTrackJson({}, {}, 200)).toEqual({})
  expect(parseTrackJson('{bad', {}, 201)).toBeNull()
  expect(parseTrackJson('{bad', {}, 503)).toEqual({})
})
