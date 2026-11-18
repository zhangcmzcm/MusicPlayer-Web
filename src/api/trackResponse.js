import { isLosslessNumber, parse, splitNumber } from 'lossless-json'
import { ApiError } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'

export const MAX_LONG = 9223372036854775807n
const MIN_LONG = -9223372036854775808n

export function invalidResponse() {
  const error = new ApiError({ code: 'INVALID_RESPONSE' })
  reportError(error)
  return error
}

export function longString(value, minimum = 0n, maximum = MAX_LONG) {
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

export function optionalLong(value) {
  if (value === null || value === undefined) return null
  try {
    return longString(value, MIN_LONG)
  } catch {
    return null
  }
}

export function parseTrackJson(data, _headers, status) {
  if (typeof data !== 'string' || data === '') return data
  try {
    return parse(data)
  } catch {
    if (status >= 400) return {}
    return null
  }
}
