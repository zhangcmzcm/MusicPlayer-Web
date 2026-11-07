import { expect, it } from 'vitest'
import { login, registerUser, sendRegistrationCode } from './auth.js'
import { http } from './http.js'
import { authenticated, ticket } from '../test/factories.js'

it.each([undefined, null, {}, { email: null, extension: true }])(
  'should_accept_registration_without_consuming_profile_%j',
  async (data) => {
    const original = http.defaults.adapter
    const controller = new AbortController()
    const payload = { username: 'listener', password: ' sample-password ' }
    http.defaults.adapter = async (config) => {
      expect(config.url).toBe('/auth/register')
      expect(config.publicRequest).toBe(true)
      expect(config.signal).toBe(controller.signal)
      expect(config.headers.has('Authorization')).toBe(false)
      expect(JSON.parse(config.data)).toEqual(payload)
      return { data, status: 201, statusText: 'Created', headers: {}, config }
    }
    try {
      await expect(
        registerUser(payload, { signal: controller.signal }),
      ).resolves.toBeUndefined()
    } finally {
      http.defaults.adapter = original
    }
  },
)

it.each([200, 204])(
  'should_reject_unexpected_registration_status_%i',
  async (status) => {
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => ({
      data: {},
      status,
      headers: {},
      config,
    })
    try {
      await expect(registerUser({})).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      })
    } finally {
      http.defaults.adapter = original
    }
  },
)

it.each([
  ['REGISTER', new Date(Date.now() + 300000).toISOString(), true],
  ['LOGIN', new Date(Date.now() + 300000).toISOString(), false],
  ['REGISTER', null, false],
  ['REGISTER', '2020-01-01T00:00:00Z', false],
])(
  'should_validate_registration_code_response_%s_%s',
  async (purpose, expiresAt, valid) => {
    const original = http.defaults.adapter
    http.defaults.adapter = async (config) => {
      expect(JSON.parse(config.data)).toEqual({
        email: 'a@example.test',
        purpose: 'REGISTER',
      })
      expect(config.publicRequest).toBe(true)
      return { data: { purpose, expiresAt }, status: 200, headers: {}, config }
    }
    try {
      const result = sendRegistrationCode('a@example.test')
      if (valid) await expect(result).resolves.toEqual({ purpose, expiresAt })
      else
        await expect(result).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    } finally {
      http.defaults.adapter = original
    }
  },
)

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
