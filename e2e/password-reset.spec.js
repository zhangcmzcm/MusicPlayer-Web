import { test, expect } from '@playwright/test'

const identifier = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const resetTicket = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8'
async function mockReset(page, options = {}) {
  const requests = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url()).pathname
    const payload = request.postDataJSON()
    expect(request.headers().authorization).toBeUndefined()
    requests.push({ url, payload })
    if (url.endsWith('password-reset-requests')) {
      await route.fulfill({
        status: 202,
        json: {
          challengeId: identifier,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      })
    } else if (url.endsWith('password-reset-verifications')) {
      if (options.verifyError)
        await route.fulfill({
          status: 400,
          json: { code: 'PASSWORD_RESET_VERIFICATION_FAILED' },
        })
      else
        await route.fulfill({
          status: 200,
          json: {
            resetTicket,
            expiresAt: new Date(
              Date.now() + (options.expiry || 300000),
            ).toISOString(),
          },
        })
    } else if (url.endsWith('password-resets')) {
      if (options.completeError)
        await route.fulfill({
          status: options.status || 400,
          headers: options.retryAfter ? { 'Retry-After': '30' } : {},
          json: { code: options.completeError },
        })
      else await route.fulfill({ status: 204, body: '' })
    } else throw new Error(`Unexpected mocked request ${url}`)
  })
  return requests
}
async function codeStage(page) {
  await page
    .getByLabel('邮箱地址', { exact: true })
    .fill(' Listener@Example.test ')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByLabel('邮箱验证码', { exact: true })).toBeVisible()
}
async function passwordStage(page) {
  await codeStage(page)
  await page.getByLabel('邮箱验证码', { exact: true }).fill('012345')
  await page.getByRole('button', { name: '验证并继续', exact: true }).click()
  await expect(page.getByLabel('新密码', { exact: true })).toBeVisible()
}
async function fillPasswords(page) {
  await page.getByLabel('新密码', { exact: true }).fill(' sample-password ')
  await page.getByLabel('确认新密码', { exact: true }).fill(' sample-password ')
}

test('should_reset_through_public_three_step_flow_and_prefill_login', async ({
  page,
}) => {
  const requests = await mockReset(page)
  await page.goto('/login')
  await page.getByRole('link', { name: '忘记密码？' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await passwordStage(page)
  await fillPasswords(page)
  const visibility = page.getByRole('button', {
    name: '显示新密码',
    exact: true,
  })
  await visibility.focus()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('新密码', { exact: true })).toHaveAttribute(
    'type',
    'text',
  )
  await page.keyboard.press('Space')
  await expect(page.getByLabel('新密码', { exact: true })).toHaveAttribute(
    'type',
    'password',
  )
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByTestId('password-reset-success')).toContainText(
    '密码已重置',
  )
  await expect(page.getByTestId('email-input')).toHaveValue(
    'listener@example.test',
  )
  await expect(page.getByTestId('password-input')).toHaveValue('')
  expect(requests.map((request) => request.payload)).toEqual([
    { email: 'listener@example.test' },
    { challengeId: identifier, code: '012345' },
    { resetTicket, newPassword: ' sample-password ' },
  ])
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 })
  await page.reload()
  await expect(page.getByTestId('password-reset-success')).toHaveCount(0)
})

test('should_retain_code_on_failure_and_reset_to_email_after_reload', async ({
  page,
}) => {
  await mockReset(page, { verifyError: true })
  await page.goto('/forgot-password')
  await codeStage(page)
  await page.getByLabel('邮箱验证码', { exact: true }).fill('012345')
  await page.getByRole('button', { name: '验证并继续', exact: true }).click()
  await expect(page.getByTestId('reset-error')).toContainText(
    '验证码或找回申请无效',
  )
  await expect(page.getByLabel('邮箱验证码', { exact: true })).toHaveValue(
    '012345',
  )
  await page.reload()
  await expect(page.getByLabel('邮箱地址', { exact: true })).toHaveValue('')
})

for (const [code, status, message] of [
  ['NEW_PASSWORD_SAME_AS_OLD', 400, '新密码不能与原密码相同'],
  ['PASSWORD_RESET_VERIFICATION_FAILED', 400, '重新验证邮箱'],
  ['PASSWORD_RESET_CONFIRMATION_UNAVAILABLE', 503, '登录核实'],
  ['PASSWORD_RESET_CONFIRMATION_RATE_LIMITED', 429, '过于频繁'],
]) {
  test(`should_recover_from_${code}`, async ({ page }) => {
    await mockReset(page, {
      completeError: code,
      status,
      retryAfter: status === 429,
    })
    await page.goto('/forgot-password')
    await passwordStage(page)
    await fillPasswords(page)
    await page.getByRole('button', { name: '重置密码', exact: true }).click()
    await expect(
      page.getByTestId(
        status === 503 || code === 'PASSWORD_RESET_VERIFICATION_FAILED'
          ? 'reset-notice'
          : 'reset-error',
      ),
    ).toContainText(message)
    if (status === 429)
      await expect(page.getByTestId('reset-continue')).toBeDisabled()
    if (status === 503) {
      await expect(
        page.getByRole('link', { name: '返回登录', exact: true }),
      ).toBeVisible()
      await expect(page.getByLabel('新密码', { exact: true })).toHaveValue('')
    }
    if (code === 'NEW_PASSWORD_SAME_AS_OLD')
      await expect(page.getByTestId('reset-continue')).toBeEnabled()
  })
}

test('should_expire_ticket_and_request_email_again', async ({ page }) => {
  await mockReset(page, { expiry: 3000 })
  await page.goto('/forgot-password')
  await passwordStage(page)
  await expect(page.getByTestId('reset-notice')).toContainText('凭据已过期')
  await expect(page.getByTestId('reset-continue')).toBeDisabled()
  await page.getByRole('button', { name: '重新验证邮箱', exact: true }).click()
  await expect(page.getByLabel('邮箱地址', { exact: true })).toBeVisible()
})

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`should_show_centered_form_and_errors_${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await mockReset(page)
    await page.goto('/forgot-password')
    await page.getByRole('button', { name: '获取验证码', exact: true }).click()
    await expect(
      page.getByText('请输入有效邮箱，最多 120 个字符', { exact: true }),
    ).toBeVisible()
    await passwordStage(page)
    await page.getByLabel('新密码', { exact: true }).fill('short')
    await page.getByLabel('确认新密码', { exact: true }).fill('different')
    await page.getByRole('button', { name: '重置密码', exact: true }).click()
    await expect(
      page.getByText('两次输入的密码必须一致', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '重新验证邮箱', exact: true }),
    ).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0)
    await expect(
      page.getByRole('navigation', { name: '找回密码进度' }),
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('password-reset-layout.png'),
      fullPage: true,
    })
  })
}
