import { errorMessages } from './errors.js'

export function reportError(error) {
  console.warn('[music-web]', {
    code: Object.hasOwn(errorMessages, error?.code) ? error.code : 'UNKNOWN',
    status: Number.isInteger(error?.status) ? error.status : 0,
  })
}
