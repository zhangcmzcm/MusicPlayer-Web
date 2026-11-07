import { test, expect } from '@playwright/test'
import { mockApi } from './fixtures.js'

async function fillRegistration(page, email = '') {
  await page.getByTestId('register-username').fill('listener')
  await page.getByTestId('register-password').fill('sample-password')
  await page.getByTestId('register-confirmPassword').fill('sample-password')
  if (email) {
    await page.getByTestId('register-email').fill(email)
    await page.getByTestId('register-code').fill('012345')
  }
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`should_fit_registration_capacity_${viewport.width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, () => ({
      status: 409,
      body: { code: 'USERNAME_ALREADY_EXISTS' },
    }))
    await page.goto('/register')
    const initialLeaf = await page.getByTestId('main-leaf').boundingBox()
    await fillRegistration(page, 'a@example.test')
    await page.getByTestId('register-submit').click()
    await expect(page.getByTestId('register-error')).toBeVisible()
    // 只在测试 DOM 注入容量文本，产品中没有容量开关或假入口。
    await page.evaluate(() => {
      const feedback = document.querySelector('[data-testid="register-error"]')
      feedback.textContent =
        '账户信息暂时无法使用，\n请检查用户名和邮箱后重新提交。'
      feedback.style.whiteSpace = 'pre-line'
      const status = document.createElement('p')
      status.textContent = '验证码已发送，请及时查收。'
      status.dataset.capacityProbe = ''
      status.style.cssText = 'font-size:12px;line-height:18px;margin:4px 0 0'
      document.querySelector('.feedback-space').append(status)
      for (const item of document.querySelectorAll('.floating-field')) {
        const error = document.createElement('div')
        error.textContent = '请检查当前填写的信息，\n确认格式与长度符合要求。'
        error.style.whiteSpace = 'pre-line'
        error.className = 'el-form-item__error'
        error.dataset.capacityProbe = ''
        item.querySelector('.el-form-item__content').append(error)
      }
    })
    await page.screenshot({
      path: testInfo.outputPath('registration-capacity.png'),
      fullPage: true,
    })
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - innerWidth,
        height: document.documentElement.scrollHeight - innerHeight,
      })),
    ).toEqual({ width: 0, height: 0 })
    expect(await page.getByTestId('main-leaf').boundingBox()).toEqual(
      initialLeaf,
    )
    const errorGaps = await page.evaluate(() => {
      const fields = [...document.querySelectorAll('.floating-field')]
      return fields.slice(0, -1).map((field, index) => {
        const error = field
          .querySelector('.el-form-item__error')
          .getBoundingClientRect()
        const nextLabel = fields[index + 1]
          .querySelector('label')
          .getBoundingClientRect()
        return nextLabel.top - error.bottom
      })
    })
    expect(Math.min(...errorGaps)).toBeGreaterThanOrEqual(2)
    const outside = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="main-leaf"] path')
      const inverse = path.getScreenCTM().inverse()
      const elements = [
        ...document.querySelectorAll(
          '[data-testid="register-view"] input, [data-testid="register-view"] label, [data-testid="register-view"] button, [data-testid="register-view"] a, .email-help, .el-form-item__error, [data-testid="register-error"], [data-capacity-probe]',
        ),
      ]
      if (innerWidth > 600)
        elements.push(document.querySelector('[data-testid="auth-heading"]'))
      return elements
        .filter((element) => {
          const box = element.getBoundingClientRect()
          return ![
            [box.left, box.top],
            [box.right, box.top],
            [box.left, box.bottom],
            [box.right, box.bottom],
          ].every(([x, y]) =>
            path.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse)),
          )
        })
        .map((element) => element.textContent)
    })
    expect(outside).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath('registration-capacity.png'),
      fullPage: true,
    })
    await page.reload()
    await expect(page.locator('[data-capacity-probe]')).toHaveCount(0)
  })
}

test('should_register_without_email_and_return_to_username_login', async ({
  page,
}) => {
  let payload
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, (request) => {
    payload = request.postDataJSON()
    return { status: 201, body: {} }
  })
  await page.goto('/login')
  await page.getByRole('link', { name: '还没有账号？去注册' }).click()
  await fillRegistration(page)
  await expect(page.getByTestId('register-code')).toHaveCount(0)
  await page.getByTestId('register-submit').click()
  await expect(page).toHaveURL(/\/login$/)
  expect(payload).toEqual({ username: 'listener', password: 'sample-password' })
  await expect(page.getByTestId('username-input')).toHaveValue('listener')
  await expect(page.getByTestId('password-input')).toHaveValue('')
  await expect(page.getByTestId('registration-success')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
})

test('should_register_with_email_and_preserve_leading_zero', async ({
  page,
}) => {
  const requests = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, (request) => {
    requests.push(request.postDataJSON())
    return request.url().endsWith('/email/send-code')
      ? {
          body: {
            purpose: 'REGISTER',
            expiresAt: new Date(Date.now() + 300000).toISOString(),
          },
        }
      : { status: 201, body: { email: null, extra: true } }
  })
  await page.goto('/register')
  await fillRegistration(page, 'Listener@Example.Test')
  await page.getByTestId('register-send-code').click()
  await expect(page.getByTestId('register-code-notice')).toBeVisible()
  await page.getByTestId('register-submit').click()
  await expect(page).toHaveURL(/\/login$/)
  expect(requests).toEqual([
    { email: 'listener@example.test', purpose: 'REGISTER' },
    {
      username: 'listener',
      password: 'sample-password',
      email: 'listener@example.test',
      code: '012345',
    },
  ])
  await page.reload()
  await expect(page.getByTestId('registration-success')).toHaveCount(0)
})

test('should_keep_scene_during_navigation_and_history', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  const leaf = await page.getByTestId('main-leaf').elementHandle()
  await page.getByRole('link', { name: '还没有账号？去注册' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByTestId('auth-scene')).toHaveClass(
    /scene-transitioning/,
  )
  await page.waitForTimeout(900)
  await page.screenshot({ path: testInfo.outputPath('flip-midpoint.png') })
  await expect(page.getByTestId('auth-scene')).not.toHaveClass(
    /scene-transitioning/,
  )
  expect(
    await page
      .getByTestId('main-leaf')
      .evaluate((node, previous) => node === previous, leaf),
  ).toBe(true)
  await expect(page.getByTestId('register-title')).toBeFocused()
  await page.goBack()
  await expect(page.getByTestId('auth-scene')).not.toHaveClass(
    /scene-transitioning/,
  )
  await expect(page.getByTestId('login-title')).toBeFocused()
  await page.goForward()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByTestId('auth-scene')).not.toHaveClass(
    /scene-transitioning/,
  )
  await expect(page.getByTestId('register-title')).toBeFocused()
})

test('should_share_ip_limit_across_auth_pages', async ({ page }) => {
  let requests = 0
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, () => {
    requests++
    return {
      status: 429,
      body: { code: 'SEND_CODE_TOO_FREQUENTLY', scope: 'IP_RATE_LIMIT' },
      headers: { 'Retry-After': '60' },
    }
  })
  await page.goto('/register')
  await page.getByTestId('register-email').fill('a@example.test')
  await page.getByTestId('register-send-code').click()
  await expect(page.getByTestId('register-send-code')).toBeDisabled()
  await page.getByRole('link', { name: '已有账号？去登录' }).click()
  await page.getByTestId('other-methods').click()
  await page.getByTestId('method-EMAIL_CODE').click()
  await page.getByTestId('email-input').fill('b@example.test')
  await expect(page.getByTestId('send-code')).toBeDisabled()
  expect(requests).toBe(1)
})

test('should_preserve_mobile_leaf_and_accessible_floating_labels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/register')
  await expect(page.getByLabel('用户名', { exact: false })).toBeVisible()
  const password = page
    .getByLabel('密码', { exact: false })
    .filter({ visible: true })
  await page.getByTestId('register-password').fill('sample-password')
  await page.getByRole('button', { name: '显示密码', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('register-password')).toHaveAttribute(
    'type',
    'text',
  )
  await page.getByTestId('register-confirmPassword').fill('sample-password')
  await expect(
    page.getByRole('button', { name: '显示确认密码', exact: true }),
  ).toBeVisible()
  expect(await page.locator('.small-leaves svg').count()).toBe(3)
  expect(await password.count()).toBeGreaterThan(0)
  const headings = await page.evaluate(() => {
    const brand = document.querySelector('.brand').getBoundingClientRect()
    const title = document.querySelector('h1').getBoundingClientRect()
    return {
      gap: title.left - brand.right,
      vertical: Math.abs(title.top - brand.top),
    }
  })
  expect(headings.gap).toBeGreaterThan(0)
  expect(headings.vertical).toBeLessThan(8)
})

test('should_align_actual_leaf_and_poem_for_both_routes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [path, center] of [
    ['/login', 0.38],
    ['/register', 0.62],
  ]) {
    await page.goto(path)
    const geometry = await page.evaluate(() => {
      const leaf = document
        .querySelector('[data-testid="main-leaf"] path')
        .getBoundingClientRect()
      const poem = document
        .querySelector('[data-testid="scene-poem"]')
        .getBoundingClientRect()
      return {
        center: (leaf.left + leaf.width / 2) / innerWidth,
        leafLeft: leaf.left,
        leafRight: leaf.right,
        poemLeft: poem.left,
        poemRight: poem.right,
      }
    })
    expect(geometry.center).toBeCloseTo(center, 2)
    if (path === '/login')
      expect(geometry.poemLeft).toBeGreaterThan(geometry.leafRight)
    else expect(geometry.poemRight).toBeLessThan(geometry.leafLeft)
    await expect(page.getByTestId('scene-poem')).toHaveText('一叶清新一曲自在')
  }
})

test('should_expand_code_area_without_resizing_leaf', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/register')
  const leaf = await page.getByTestId('main-leaf').boundingBox()
  await page.evaluate(() => {
    window.fieldTransitionEvents = []
    for (const type of ['transitionrun', 'transitionend']) {
      document.addEventListener(type, (event) => {
        if (
          event.propertyName === 'height' &&
          event.target.dataset.testid === 'register-field-code'
        ) {
          window.fieldTransitionEvents.push({
            type,
            height: event.target.getBoundingClientRect().height,
          })
        }
      })
    }
  })
  await page.getByTestId('register-email').fill('a@example.test')
  await page.waitForTimeout(400)
  await testInfo.attach('field-transition-observation', {
    contentType: 'application/json',
    body: JSON.stringify(
      await page.evaluate(() => {
        const field = document.querySelector(
          '[data-testid="register-field-code"]',
        )
        const style = getComputedStyle(field)
        return {
          events: window.fieldTransitionEvents,
          classes: field.className,
          inline: field.getAttribute('style'),
          height: style.height,
          scrollHeight: field.scrollHeight,
          transition: style.transition,
        }
      }),
    ),
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const field = document.querySelector(
          '[data-testid="register-field-code"]',
        )
        return {
          endCount: window.fieldTransitionEvents.filter(
            (event) => event.type === 'transitionend',
          ).length,
          events: window.fieldTransitionEvents,
          height: getComputedStyle(field).height,
          inline: field.getAttribute('style'),
          classes: field.className,
        }
      }),
    )
    .toEqual(expect.objectContaining({ endCount: 1 }))
  const events = await page.evaluate(() => window.fieldTransitionEvents)
  expect(events[0].height).toBeLessThan(events[1].height)
  expect(events[1].height).toBeGreaterThanOrEqual(88)
  expect(await page.getByTestId('main-leaf').boundingBox()).toEqual(leaf)
  await page.getByTestId('register-email').fill('')
  await expect(page.getByTestId('register-field-code')).toHaveCount(0)
  expect(await page.getByTestId('main-leaf').boundingBox()).toEqual(leaf)
})
