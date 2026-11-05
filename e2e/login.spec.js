import { test, expect } from '@playwright/test'
import { authenticated, selection, mockApi, fillPassword } from './fixtures.js'

async function stableBoxes(page) {
  return page.evaluate(() =>
    [
      '[data-testid="main-leaf"]',
      '[data-testid="login-view"] .heading',
      '[data-testid="login-view"] .el-input',
      '[data-testid="login-submit"]',
    ].flatMap((selector) =>
      [...document.querySelectorAll(selector)].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
    ),
  )
}

async function expectStable(page, initial) {
  const boxes = await stableBoxes(page)
  expect(boxes).toHaveLength(initial.length)
  boxes.forEach((box, index) => {
    for (const key of ['x', 'y', 'width', 'height'])
      expect(
        Math.abs(box[key] - initial[index][key]),
        `${index}.${key}`,
      ).toBeLessThanOrEqual(1)
  })
  expect(
    await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - innerWidth,
      vertical: document.documentElement.scrollHeight - innerHeight,
    })),
  ).toEqual({ horizontal: 0, vertical: 0 })
}

async function leafOverflow(page) {
  return page.evaluate(() => {
    const path = document.querySelector('[data-testid="main-leaf"] path')
    const inverse = path.getScreenCTM().inverse()
    const elements = document.querySelectorAll(
      '[data-testid="login-view"] h1, [data-testid="login-view"] .eyebrow, [data-testid="login-view"] .intro, [data-testid="login-view"] input, [data-testid="login-submit"], .el-form-item__error, [data-testid="login-error"] p, [data-testid="code-notice"], [data-capacity-probe]',
    )
    return [...elements]
      .filter((element) => {
        if (!element.getClientRects().length) return false
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
        name:
          element.getAttribute('data-testid') ||
          element.className ||
          element.tagName,
        text: element.textContent,
      }))
  })
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
])
  for (const method of ['EMAIL_PASSWORD', 'USERNAME_PASSWORD', 'EMAIL_CODE']) {
    test(`should_keep_stable_layout_${viewport.width}_${method}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page, (request) =>
        request.url().endsWith('/email/send-code')
          ? {
              body: {
                purpose: 'LOGIN',
                expiresAt: new Date(Date.now() + 300000).toISOString(),
              },
            }
          : { status: 503, body: { code: 'AUTH_STATE_STORE_UNAVAILABLE' } },
      )
      await page.goto('/login')
      if (method !== 'EMAIL_PASSWORD') {
        await page.getByTestId('other-methods').click()
        await page.getByTestId(`method-${method}`).click()
      }
      await expect(page.getByTestId('login-submit')).toBeVisible()
      const initial = await stableBoxes(page)
      await page.getByTestId('other-methods').click()
      await expectStable(page, initial)
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(
          method === 'USERNAME_PASSWORD' ? '请输入用户名' : '请输入邮箱地址',
          { exact: true },
        ),
      ).toBeVisible()
      await expectStable(page, initial)
      await page
        .getByTestId(
          method === 'USERNAME_PASSWORD' ? 'username-input' : 'email-input',
        )
        .fill(method === 'USERNAME_PASSWORD' ? 'xx' : 'invalid')
      await page
        .getByTestId(method === 'EMAIL_CODE' ? 'code-input' : 'password-input')
        .fill(method === 'EMAIL_CODE' ? '12345x' : 'short')
      await page.getByTestId('login-submit').click()
      await expect(
        page.getByText(
          method === 'USERNAME_PASSWORD'
            ? '用户名需为 3–80 个字符'
            : '请输入有效邮箱，最多 120 个字符',
          { exact: true },
        ),
      ).toBeVisible()
      await expectStable(page, initial)
      expect(await leafOverflow(page)).toEqual([])
      await page
        .getByTestId(
          method === 'USERNAME_PASSWORD' ? 'username-input' : 'email-input',
        )
        .fill(
          method === 'USERNAME_PASSWORD' ? 'listener' : 'listener@example.test',
        )
      if (method === 'EMAIL_CODE') await page.getByTestId('send-code').click()
      await page
        .getByTestId(method === 'EMAIL_CODE' ? 'code-input' : 'password-input')
        .fill(method === 'EMAIL_CODE' ? '012345' : 'sample-password')
      await page.getByTestId('login-submit').click()
      await expect(page.getByTestId('login-error')).toBeVisible()
      if (method === 'EMAIL_CODE') {
        await expect(page.getByTestId('login-recovery')).toBeVisible()
        await expect(page.getByTestId('code-notice')).toBeVisible()
      }
      await expectStable(page, initial)
      await page.evaluate(() => {
        for (const [selector, text] of [
          ['.password-assist-space', '忘记密码？'],
          ['.account-navigation-space', '还没有账号？点这里'],
        ]) {
          const parent = document.querySelector(selector)
          if (!parent) continue
          const span = document.createElement('span')
          span.dataset.capacityProbe = ''
          span.textContent = text
          parent.append(span)
        }
      })
      await expectStable(page, initial)
      expect(await leafOverflow(page)).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath('capacity.png'),
        fullPage: true,
      })
      await page.reload()
      await expect(page.locator('[data-capacity-probe]')).toHaveCount(0)
      await expect(page.getByRole('link', { name: '忘记密码？' })).toHaveCount(
        0,
      )
    })
  }

test('should_keep_stable_layout_when_field_error_wraps_to_two_lines', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  await expect(page.getByTestId('login-submit')).toBeVisible()
  const initial = await stableBoxes(page)
  await page.getByTestId('email-input').fill('invalid')
  await page.getByTestId('password-input').fill('short')
  await page.getByTestId('login-submit').click()
  const error = page.getByText('请输入有效邮箱，最多 120 个字符', {
    exact: true,
  })
  await expect(error).toBeVisible()
  // Test a narrower text measure without changing font size or the control width.
  await error.evaluate((element) => {
    element.style.maxWidth = '140px'
  })
  await expectStable(page, initial)
  expect(await leafOverflow(page)).toEqual([])
})

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1366, height: 600 },
])
  test(`should_allow_page_scroll_in_short_viewport_${viewport.width}_${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')
    await page.getByTestId('login-submit').click()
    await page.getByTestId('other-methods').click()
    await expect(page.getByTestId('other-methods')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await page.getByTestId('method-EMAIL_CODE').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('method-EMAIL_CODE')).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(await leafOverflow(page)).toEqual([])
    await page.getByTestId('method-EMAIL_CODE').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('code-input')).toBeVisible()
    await expect(page.locator('#login-methods')).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          [
            ...document.querySelectorAll(
              '[data-testid="login-view"] *, .scene-content, .scene-main',
            ),
          ].filter((element) => {
            const { overflowY } = getComputedStyle(element)
            return (
              ['auto', 'scroll'].includes(overflowY) &&
              element.scrollHeight > element.clientHeight
            )
          }).length,
      ),
    ).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath('short.png'),
      fullPage: true,
    })
  })

test('should_recover_from_uncertain_ticket_without_automatic_retry', async ({
  page,
}) => {
  let requests = 0
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, (request) => {
    requests++
    return request.postDataJSON().loginType === 'ROLE_SELECTION'
      ? { status: 503, body: { code: 'AUTH_STATE_STORE_UNAVAILABLE' } }
      : { body: selection() }
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByTestId('login-submit').click()
  await page.getByTestId('role-USER').click()
  await expect(page.getByTestId('login-error')).toContainText(
    '登录服务暂时不可用',
  )
  await expect(page.getByTestId('login-recovery')).toContainText(
    '登录票据也可能已失效',
  )
  await page.getByTestId('restart-login').click()
  await expect(page.getByTestId('password-input')).toHaveValue('')
  await expect(page.getByTestId('login-recovery')).toHaveCount(0)
  expect(requests).toBe(2)
})

test('should_preserve_code_cooldown_after_uncertain_network_result', async ({
  page,
}) => {
  let logins = 0,
    sends = 0
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().url().endsWith('/email/send-code')) {
      sends++
      await route.fulfill({
        json: {
          purpose: 'LOGIN',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      })
    } else {
      logins++
      await route.abort('failed')
    }
  })
  await page.goto('/login')
  await page.getByTestId('other-methods').click()
  await page.getByTestId('method-EMAIL_CODE').click()
  await page.getByTestId('email-input').fill('listener@example.test')
  await page.getByTestId('send-code').click()
  await page.getByTestId('code-input').fill('012345')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-recovery')).toContainText(
    '验证码可能已被使用',
  )
  await expect(page.getByTestId('code-notice')).toBeVisible()
  await expect(page.getByTestId('send-code')).toBeDisabled()
  expect(logins).toBe(1)
  expect(sends).toBe(1)
  await page.clock.install()
  await page.clock.fastForward(61000)
  await expect(page.getByTestId('send-code')).toBeEnabled()
  await page.getByTestId('send-code').click()
  await expect(page.getByTestId('login-recovery')).toHaveCount(0)
  expect(sends).toBe(2)
})

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

for (const role of ['USER', 'ADMIN']) {
  test(`should_select_${role}_and_restore_session_without_bound_email`, async ({
    page,
  }) => {
    const requests = []
    await mockApi(page, (request) => {
      const payload = request.postDataJSON()
      requests.push(payload)
      if (payload.loginType !== 'ROLE_SELECTION') return { body: selection() }
      const body = authenticated(role)
      body.authentication.user.email = null
      return { body }
    })
    await page.goto('/login')
    await page.getByTestId('other-methods').click()
    await page.getByTestId('method-USERNAME_PASSWORD').click()
    await page.getByTestId('username-input').fill('listener')
    await page.getByTestId('password-input').fill('sample-password')
    await page.getByTestId('login-submit').click()
    await page.getByTestId(`role-${role}`).click()
    await expect(page.getByTestId('session-role')).toHaveText(
      `本次身份：${role === 'ADMIN' ? '管理员' : '用户'}`,
    )
    await expect(page.getByTestId('login-error')).toHaveCount(0)
    expect(requests[1]).toEqual({
      loginType: 'ROLE_SELECTION',
      loginTicket: 'e2e-selection-ticket',
      loginRole: role,
    })
    await page.reload()
    await expect(page.getByTestId('login-success')).toBeVisible()
    await expect(page.getByTestId('session-role')).toHaveText(
      `本次身份：${role === 'ADMIN' ? '管理员' : '用户'}`,
    )
    expect(requests).toHaveLength(2)
  })
}
