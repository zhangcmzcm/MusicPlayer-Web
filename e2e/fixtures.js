export function authenticated(role = 'USER') {
  return {
    status: 'AUTHENTICATED',
    roleSelection: null,
    authentication: {
      // 仅用于 mock 响应，非有效签名凭据。
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
    },
  }
}

export function selection() {
  return {
    status: 'ROLE_SELECTION_REQUIRED',
    authentication: null,
    roleSelection: {
      loginTicket: 'e2e-selection-ticket',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
  }
}

export async function mockApi(
  page,
  handler,
  { defaultLibraryPage = true } = {},
) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const query = url.searchParams
    const defaultPage =
      defaultLibraryPage &&
      request.method() === 'GET' &&
      url.pathname === '/api/v1/tracks' &&
      query.get('status') === 'PUBLISHED' &&
      query.get('page') === '0' &&
      query.get('size') === '20' &&
      query.get('sort') === 'createdAt,desc' &&
      !query.get('q')
    const response = defaultPage
      ? {
          body: {
            items: [],
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
            hasNext: false,
          },
        }
      : await handler(request)
    if (!response) {
      await route.abort('failed')
      throw Error('Unexpected mocked API request')
    }
    await route.fulfill({
      status: response.status || 200,
      contentType: response.contentType || 'application/json',
      body: response.rawBody ?? JSON.stringify(response.body),
      headers: response.headers,
    })
  })
}

export async function fillPassword(page) {
  await page.getByTestId('email-input').fill('listener@example.test')
  await page.getByTestId('password-input').fill('sample-password')
}
