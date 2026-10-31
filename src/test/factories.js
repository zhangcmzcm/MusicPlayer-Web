export function authentication(role = 'USER') {
  return {
    accessToken: 'test-session-token',
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
