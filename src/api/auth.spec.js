import { expect, it } from 'vitest'
import { login } from './auth.js'
import { http } from './http.js'
import { authenticated, ticket } from '../test/factories.js'

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

it.each([
  {
    name: 'missing-status',
    mutate: (data) => {
      delete data.status
    },
  },
  {
    name: 'unknown-status',
    mutate: (data) => {
      data.status = 'UNKNOWN'
    },
  },
  {
    name: 'missing-authentication',
    mutate: (data) => {
      delete data.authentication
    },
  },
  {
    name: 'null-authentication',
    mutate: (data) => {
      data.authentication = null
    },
  },
  {
    name: 'non-null-role-selection-after-authentication',
    mutate: (data) => {
      data.roleSelection = ticket()
    },
  },
  {
    name: 'missing-role-selection-after-authentication',
    mutate: (data) => {
      delete data.roleSelection
    },
  },
])('should_reject_inconsistent_response_$name', async ({ mutate }) => {
  const data = authenticated()
  mutate(data)
  const original = http.defaults.adapter
  http.defaults.adapter = async (config) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  try {
    await expect(login({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  } finally {
    http.defaults.adapter = original
  }
})

it.each([
  {
    name: 'missing-ticket',
    mutate: (data) => {
      delete data.roleSelection.loginTicket
    },
  },
  {
    name: 'empty-ticket',
    mutate: (data) => {
      data.roleSelection.loginTicket = ''
    },
  },
  {
    name: 'non-string-ticket',
    mutate: (data) => {
      data.roleSelection.loginTicket = 42
    },
  },
  {
    name: 'null-selection',
    mutate: (data) => {
      data.roleSelection = null
    },
  },
  {
    name: 'missing-expiry',
    mutate: (data) => {
      delete data.roleSelection.expiresAt
    },
  },
  {
    name: 'expired-ticket',
    mutate: (data) => {
      data.roleSelection.expiresAt = new Date(0).toISOString()
    },
  },
  {
    name: 'non-null-authentication',
    mutate: (data) => {
      data.authentication = authenticated().authentication
    },
  },
])('should_reject_invalid_selection_response_$name', async ({ mutate }) => {
  const data = {
    status: 'ROLE_SELECTION_REQUIRED',
    authentication: null,
    roleSelection: ticket(),
  }
  mutate(data)
  const original = http.defaults.adapter
  http.defaults.adapter = async (config) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  try {
    await expect(login({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  } finally {
    http.defaults.adapter = original
  }
})

it.each(['AUTHENTICATED', 'ROLE_SELECTION_REQUIRED'])(
  'should_ignore_unrelated_new_response_fields_for_%s',
  async (status) => {
    const data =
      status === 'AUTHENTICATED'
        ? { ...authenticated(), extra: 'unrelated' }
        : {
            status: 'ROLE_SELECTION_REQUIRED',
            authentication: null,
            roleSelection: ticket(),
            extra: 'unrelated',
          }
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    try {
      await expect(login({})).resolves.toEqual(data)
    } finally {
      http.defaults.adapter = original
    }
  },
)
