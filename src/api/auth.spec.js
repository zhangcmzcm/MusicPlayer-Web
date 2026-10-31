import { expect, it } from 'vitest'
import { login } from './auth.js'
import { http } from './http.js'
import { authenticated } from '../test/factories.js'

it.each(['USER', 'ADMIN'])(
  'should_accept_%s_role_selection_response_with_null_email',
  async (role) => {
    const result = authenticated(role)
    result.authentication.user.email = null
    result.authentication.expiresAt = result.authentication.expiresAt.replace(
      'Z',
      '123456Z',
    )
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      expect(JSON.parse(config.data)).toEqual({
        loginType: 'ROLE_SELECTION',
        loginTicket: 'test-selection-ticket',
        loginRole: role,
      })
      return {
        data: result,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    try {
      await expect(
        login({
          loginType: 'ROLE_SELECTION',
          loginTicket: 'test-selection-ticket',
          loginRole: role,
        }),
      ).resolves.toEqual(result)
    } finally {
      http.defaults.adapter = original
    }
  },
)
