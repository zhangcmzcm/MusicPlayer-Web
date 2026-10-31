import { test, expect } from '@playwright/test'
import { authenticated, selection, mockApi, fillPassword } from './fixtures.js'

test('should_validate_empty_form_without_network', async ({ page }) => {
  let requests = 0
  await mockApi(page, () => {
    requests++
    return { body: authenticated() }
  })
  await page.goto('/login')
  await page.getByTestId('login-submit').click()
  await expect(page.getByText('请输入邮箱地址', { exact: true })).toBeVisible()
  expect(requests).toBe(0)
})

test('should_login_with_email_and_restore_same_tab_session', async ({
  page,
}) => {
  const requests = []
  await mockApi(page, (request) => {
    requests.push(request.postDataJSON())
    return { body: authenticated() }
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-success')).toBeVisible()
  expect(requests).toEqual([
    {
      loginType: 'EMAIL_PASSWORD',
      account: 'listener@example.test',
      password: 'sample-password',
    },
  ])
  await page.reload()
  await expect(page.getByTestId('login-success')).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('should_login_with_username_password', async ({ page }) => {
  let sent
  await mockApi(page, (request) => {
    sent = request.postDataJSON()
    return { body: authenticated() }
  })
  await page.goto('/login')
  await page.getByTestId('other-methods').click()
  await page.getByTestId('method-USERNAME_PASSWORD').click()
  await page.getByTestId('username-input').fill('listener')
  await page.getByTestId('password-input').fill('sample-password')
  await page.getByTestId('password-input').press('Enter')
  await expect(page.getByTestId('login-success')).toBeVisible()
  expect(sent).toEqual({
    loginType: 'USERNAME_PASSWORD',
    account: 'listener',
    password: 'sample-password',
  })
})

test('should_send_code_and_preserve_leading_zero', async ({ page }) => {
  const requests = []
  await mockApi(page, (request) => {
    requests.push(request.postDataJSON())
    return {
      body: request.url().endsWith('send-code')
        ? {
            purpose: 'LOGIN',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          }
        : authenticated(),
    }
  })
  await page.goto('/login')
  await page.getByTestId('other-methods').click()
  await page.getByTestId('method-EMAIL_CODE').click()
  await page.getByTestId('email-input').fill('listener@example.test')
  await page.getByTestId('send-code').click()
  await expect(page.getByTestId('code-notice')).toBeVisible()
  await expect(page.getByTestId('send-code')).toBeDisabled()
  await page.getByTestId('code-input').fill('012345')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-success')).toBeVisible()
  expect(requests).toEqual([
    { email: 'listener@example.test', purpose: 'LOGIN' },
    { loginType: 'EMAIL_CODE', email: 'listener@example.test', code: '012345' },
  ])
})

for (const role of ['USER', 'ADMIN'])
  test(`should_select_${role}_after_admin_authentication`, async ({
    page,
  }, testInfo) => {
    const requests = []
    await mockApi(page, (request) => {
      const data = request.postDataJSON()
      requests.push(data)
      return {
        body:
          data.loginType === 'ROLE_SELECTION'
            ? authenticated(role)
            : selection(),
      }
    })
    await page.goto('/login')
    await fillPassword(page)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('role-selection')).toBeVisible()
    await expect(page.getByTestId(`role-${role}`)).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath('role-selection.png'),
      fullPage: true,
    })
    await page.getByTestId(`role-${role}`).click()
    await expect(page.getByTestId('session-role')).toHaveText(
      `本次身份：${role === 'ADMIN' ? '管理员' : '用户'}`,
    )
    expect(requests[1]).toEqual({
      loginType: 'ROLE_SELECTION',
      loginTicket: 'e2e-selection-ticket',
      loginRole: role,
    })
  })

test('should_show_network_failure_and_recover_without_reloading', async ({
  page,
}) => {
  await page.route('**/api/v1/**', (route) => route.abort('failed'))
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toContainText('网络')
  await expect(page.getByTestId('login-submit')).toBeEnabled()
  await page.unroute('**/api/v1/**')
  await mockApi(page, () => ({ body: authenticated() }))
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-success')).toBeVisible()
})

test('should_not_submit_during_ime_composition', async ({ page }) => {
  let calls = 0
  await mockApi(page, () => {
    calls++
    return { body: authenticated() }
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('password-input').dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
  })
  expect(calls).toBe(0)
  await page.getByTestId('password-input').press('Enter')
  await expect(page.getByTestId('login-success')).toBeVisible()
  expect(calls).toBe(1)
})

test('should_keep_invalid_credentials_on_login_and_recover', async ({
  page,
}) => {
  let attempts = 0
  await mockApi(page, () =>
    ++attempts === 1
      ? {
          status: 401,
          body: { code: 'INVALID_CREDENTIALS', detail: 'SQL internal secret' },
        }
      : { body: authenticated() },
  )
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toContainText('登录信息不正确')
  await expect(page.getByTestId('login-error')).not.toContainText('SQL')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-success')).toBeVisible()
})

test('should_respect_retry_after_and_prevent_duplicate_requests', async ({
  page,
}) => {
  let calls = 0
  await mockApi(page, () => {
    calls++
    return {
      status: 429,
      headers: { 'Retry-After': '30' },
      body: { code: 'LOGIN_RATE_LIMITED' },
    }
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-submit')).toBeDisabled()
  await expect(page.getByTestId('login-submit')).toContainText('秒后重试')
  expect(calls).toBe(1)
})

test('should_send_only_one_request_while_login_is_pending', async ({
  page,
}) => {
  let release,
    calls = 0
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await mockApi(page, async () => {
    calls++
    await gate
    return { body: authenticated() }
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-submit')).toBeDisabled()
  await page.getByTestId('login-submit').evaluate((button) => {
    button.form.requestSubmit()
    button.form.requestSubmit()
  })
  expect(calls).toBe(1)
  release()
  await expect(page.getByTestId('login-success')).toBeVisible()
})

test('should_not_restore_an_admin_ticket_on_refresh', async ({ page }) => {
  await mockApi(page, () => ({ body: selection() }))
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('role-selection')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('email-input')).toBeVisible()
  await expect(page.getByTestId('role-selection')).toHaveCount(0)
})

test('should_show_mobile_roles_without_motion_and_support_keyboard', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 650 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, (request) => ({
    body:
      request.postDataJSON().loginType === 'ROLE_SELECTION'
        ? authenticated('ADMIN')
        : selection(),
  }))
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  const button = page.getByTestId('role-ADMIN')
  await expect(button).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('mobile-roles.png'),
    fullPage: true,
  })
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('session-role')).toContainText('管理员')
})

test('should_show_403_and_restart_after_ticket_failure', async ({ page }) => {
  let fail = 'ROLE_SELECTION_NOT_ALLOWED'
  await mockApi(page, (request) =>
    request.postDataJSON().loginType !== 'ROLE_SELECTION'
      ? { body: selection() }
      : {
          status: fail === 'ROLE_SELECTION_NOT_ALLOWED' ? 403 : 401,
          body: { code: fail },
        },
  )
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await page.getByTestId('role-ADMIN').click()
  await expect(page.getByTestId('login-error')).toContainText('权限')
  fail = 'LOGIN_TICKET_INVALID'
  await page.getByTestId('role-ADMIN').click()
  await expect(page.getByTestId('email-input')).toBeVisible()
  await expect(page.getByTestId('login-error')).toContainText('已过期')
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 320, height: 740 },
  { width: 390, height: 844 },
])
  test(`should_fit_layout_${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')
    await expect(page.getByTestId('email-input')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (viewport.width < 1050)
      await expect(page.getByTestId('scene-poem')).toBeHidden()
    else await expect(page.getByTestId('scene-poem')).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('login.png'),
      fullPage: true,
    })
    await page.getByTestId('login-submit').click()
    await expect(
      page.getByText('请输入邮箱地址', { exact: true }),
    ).toBeVisible()
    const containment = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="main-leaf"] path')
      const inverse = path.getScreenCTM().inverse()
      return [
        ...document.querySelectorAll(
          '[data-testid="login-view"] h1, [data-testid="login-view"] .eyebrow, [data-testid="login-view"] input, [data-testid="login-submit"], .el-form-item__error',
        ),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return ![
            [rect.left, rect.top],
            [rect.right, rect.top],
            [rect.left, rect.bottom],
            [rect.right, rect.bottom],
          ].every(([x, y]) =>
            path.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse)),
          )
        })
        .map((element) => ({
          tag: element.tagName,
          name: element.getAttribute('data-testid') || element.className,
        }))
    })
    expect(containment).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath('validation.png'),
      fullPage: true,
    })
  })

test('should_display_404_for_unknown_page', async ({ page }) => {
  await page.goto('/missing')
  await expect(page.getByTestId('not-found')).toBeVisible()
  await page.getByTestId('back-to-login').click()
  await expect(page.getByTestId('email-input')).toBeVisible()
})
