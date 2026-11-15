export function authentication(role = 'USER') {
  return {
    // 仅用于形态测试；签名为固定伪值，不能用于真实后端认证。
    accessToken:
      'eyJhbGciOiJIUzI1NiJ9.eyJmaXh0dXJlIjp0cnVlfQ.c3ludGhldGljLXNpZ25hdHVyZQ',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    user: {
      id: 42,
      username: 'listener',
      email: 'listener@example.test',
      role,
    },
  }
}

export function authenticated(role = 'USER') {
  return {
    status: 'AUTHENTICATED',
    authentication: authentication(role),
    roleSelection: null,
  }
}

export function ticket() {
  return {
    loginTicket: 'test-one-time-ticket',
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  }
}

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

export function trackPage({
  id = '42',
  title = '风经过的地方',
  artistName = '林间来信',
  albumName = '叶影',
  durationMs = '245000',
  cover = null,
  status = 'PUBLISHED',
  ...overrides
} = {}) {
  return {
    items: [{ id, title, artistName, albumName, durationMs, cover, status }],
    page: 0,
    size: 20,
    totalElements: '1',
    totalPages: '1',
    hasNext: false,
    ...overrides,
  }
}

export function trackPageText(overrides = {}) {
  return JSON.stringify(trackPage(overrides)).replace(
    /"(id|durationMs|totalElements|totalPages|sizeBytes)":"(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"/g,
    '"$1":$2',
  )
}
