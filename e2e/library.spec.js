import { test, expect } from '@playwright/test'
import { authenticated, fillPassword, mockApi } from './fixtures.js'
import { trackPage, trackPageText } from '../src/test/factories.js'

const cover = {
  url: '/api/v1/tracks/42/cover',
  contentType: 'image/png',
  sizeBytes: '68',
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  'base64',
)
const heading = (page) =>
  page.getByRole('heading', { name: '曲库', exact: true })
const search = (page) =>
  page.getByRole('textbox', { name: '搜索音乐', exact: true })
const list = (overrides = {}) => ({ rawBody: trackPageText(overrides) })
const pageErrors = new WeakMap()
test.beforeEach(({ page }) => {
  const errors = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => expect(pageErrors.get(page)).toEqual([]))

async function restore(page, role = 'USER') {
  const session = authenticated(role).authentication
  await page.addInitScript(
    (value) =>
      sessionStorage.setItem('music-web.session', JSON.stringify(value)),
    session,
  )
}
async function install(page, handler) {
  await mockApi(
    page,
    (request) => {
      if (new URL(request.url()).pathname === '/api/v1/auth/login')
        return { body: authenticated() }
      expect(request.headers().authorization).toBe(
        `Bearer ${authenticated().authentication.accessToken}`,
      )
      return handler(request, new URL(request.url()))
    },
    { defaultLibraryPage: false },
  )
}

test('should_browse_search_sort_paginate_and_restore_history', async ({
  page,
}) => {
  const requests = []
  await install(page, (_request, url) => {
    expect(url.pathname).toBe('/api/v1/tracks')
    const query = Object.fromEntries(url.searchParams)
    requests.push(query)
    expect(query.status).toBe('PUBLISHED')
    return list({
      title: query.q ? `林间第${Number(query.page) + 1}页` : '风经过的地方',
      page: Number(query.page),
      size: Number(query.size),
      hasNext: true,
      totalElements: '43',
      totalPages: '3',
    })
  })
  await page.goto('/login')
  await fillPassword(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(heading(page)).toBeVisible()
  await expect(page.getByRole('link', { name: '歌曲管理' })).toHaveCount(0)
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await search(page).fill(' 林间 ')
  await search(page).press('Enter')
  await expect(page.getByText('林间第1页', { exact: true })).toBeVisible()
  expect(requests.at(-1).q).toBe(' 林间 ')
  await page.getByRole('combobox', { name: '歌曲排序' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('option', { name: '歌名升序', exact: true }).click()
  await expect.poll(() => requests.at(-1).sort).toBe('title,asc')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('林间第2页', { exact: true })).toBeVisible()
  await page.reload()
  await expect(search(page)).toHaveValue(' 林间 ')
  await expect(page.getByText('林间第2页', { exact: true })).toBeVisible()
  await page.getByRole('spinbutton', { name: '每页歌曲数' }).fill('50')
  await page.getByRole('spinbutton', { name: '每页歌曲数' }).press('Tab')
  await expect.poll(() => requests.at(-1).size).toBe('50')
  expect(requests.at(-1).page).toBe('0')
  await page.goBack()
  await expect(page.getByText('林间第2页', { exact: true })).toBeVisible()
  expect(requests.at(-1)).toMatchObject({
    page: '1',
    size: '20',
    sort: 'title,asc',
  })
})

test('should_preserve_long_ids_nullable_metadata_and_authenticated_covers', async ({
  page,
}) => {
  await restore(page, 'ADMIN')
  const id = '9223372036854775807'
  const covers = []
  await install(page, (_request, url) => {
    if (url.pathname === '/api/v1/tracks') {
      expect(url.searchParams.get('status')).toBe('PUBLISHED')
      return list({
        id,
        albumName: null,
        durationMs: null,
        cover,
        totalElements: id,
        totalPages: id,
      })
    }
    covers.push(url.pathname)
    return { rawBody: png, contentType: 'image/png' }
  })
  await page.goto('/')
  await expect(page.getByText('未标注专辑', { exact: true })).toBeVisible()
  await expect(page.getByText('--:--', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.track-cover img')
        .evaluateAll(
          (images) =>
            images.filter((image) => image.complete && image.naturalWidth > 0)
              .length,
        ),
    )
    .toBe(1)
  expect(covers).toEqual([`/api/v1/tracks/${id}/cover`])
  await expect(page.getByText(`共 ${id} 首`).first()).toBeVisible()
  await expect(page.getByRole('link', { name: '歌曲管理' })).toBeVisible()
  await expect(page.getByRole('link', { name: '收藏' })).toHaveCount(0)
})

for (const failure of ['missing', 'decode', 'interrupted']) {
  test(`should_recover_${failure}_cover_with_default_artwork`, async ({
    page,
  }) => {
    await restore(page)
    let settled = false
    for (const event of ['requestfinished', 'requestfailed'])
      page.on(event, (request) => {
        if (new URL(request.url()).pathname.endsWith('/42/cover'))
          settled = true
      })
    await page.addInitScript(() => {
      window.coverURLsReleased = 0
      const revoke = URL.revokeObjectURL.bind(URL)
      URL.revokeObjectURL = (url) => {
        window.coverURLsReleased++
        revoke(url)
      }
    })
    await install(page, async (_request, url) => {
      if (url.pathname === '/api/v1/tracks') return list({ cover })
      if (failure === 'missing')
        return {
          status: 404,
          body: { code: 'COVER_NOT_FOUND' },
          contentType: 'application/problem+json',
        }
      if (failure === 'decode')
        return {
          rawBody: Buffer.from('broken image'),
          contentType: 'image/png',
        }
      return { rawBody: png, contentType: 'image/png' }
    })
    if (failure === 'interrupted')
      await page.route('**/api/v1/tracks/42/cover', (route) =>
        route.abort('connectionreset'),
      )
    await page.goto('/')
    await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
    await expect.poll(() => settled).toBe(true)
    if (failure === 'decode')
      await expect
        .poll(() => page.evaluate(() => window.coverURLsReleased))
        .toBe(1)
    await expect(page.locator('.track-cover img')).toHaveCount(0)
    await expect(page.locator('.track-cover')).toBeVisible()
    await expect(heading(page)).toBeVisible()
  })
}

test('should_recover_a_legal_empty_page_and_validate_deep_pagination', async ({
  page,
}) => {
  await restore(page)
  const pages = []
  await install(page, (_request, url) => {
    const current = Number(url.searchParams.get('page'))
    pages.push(current)
    return list({
      items: current ? [] : trackPage().items,
      page: current,
      totalElements: '1',
      totalPages: '1',
    })
  })
  await page.goto('/?page=500')
  await expect(page.getByText('当前页暂无歌曲', { exact: true })).toBeVisible()
  await expect(page.getByText('共 1 首').first()).toBeVisible()
  await page.getByRole('textbox', { name: '页码', exact: true }).fill('502')
  await page.getByRole('button', { name: '前往指定页' }).click()
  await expect(
    page.getByText('请输入 1—501 之间的页码', { exact: true }),
  ).toBeVisible()
  expect(pages).toEqual([500])
  await page.getByRole('button', { name: '回到第一页' }).click()
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  expect(pages).toEqual([500, 0])
})

test('should_clear_search_during_rate_limit_and_retry_after_cooldown', async ({
  page,
}) => {
  await restore(page)
  let limited = true
  let searched = 0
  await install(page, (_request, url) => {
    if (!url.searchParams.get('q')) return list()
    searched++
    return limited
      ? {
          status: 429,
          body: { code: 'TRACK_SEARCH_RATE_LIMITED' },
          headers: { 'Retry-After': '2' },
        }
      : list({ title: '重试搜索结果' })
  })
  await page.goto('/?q=林间')
  await expect(
    page.getByRole('button', { name: '重试读取曲库' }),
  ).toBeDisabled()
  await search(page).fill('')
  await search(page).press('Enter')
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await expect(page.getByText(/秒后可搜索/)).toHaveCount(0)
  expect(searched).toBe(1)
  limited = false
  await search(page).fill('林间')
  await search(page).press('Enter')
  await expect(page.getByText('重试搜索结果', { exact: true })).toBeVisible()
  expect(searched).toBe(2)
})

test('should_recover_network_and_service_errors_with_manual_retry', async ({
  page,
}) => {
  await restore(page)
  let calls = 0
  await install(page, () =>
    ++calls === 1
      ? { status: 503, body: { code: 'TRACK_STORE_UNAVAILABLE' } }
      : list(),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('曲库暂时无法读取')
  await page.getByRole('button', { name: '重试读取曲库' }).click()
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await page.route('**/api/v1/tracks?**', (route) => route.abort('failed'), {
    times: 1,
  })
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('网络')
  await page.getByRole('button', { name: '重试读取曲库' }).click()
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
})

test('should_expire_the_current_session_on_binary_cover_401', async ({
  page,
}) => {
  await restore(page)
  await install(page, (_request, url) =>
    url.pathname === '/api/v1/tracks'
      ? list({ cover })
      : { status: 401, rawBody: '', contentType: 'application/problem+json' },
  )
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await expect(page.getByTestId('login-submit')).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem('music-web.session')),
  ).toBeNull()
})

test('should_discard_old_requests_when_a_same_token_session_is_renewed', async ({
  page,
}) => {
  await restore(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let covers = 0
  await install(page, async (_request, url) => {
    if (url.pathname === '/api/v1/tracks') return list({ cover })
    covers++
    if (covers === 1) {
      await gate
      return { status: 401, body: { code: 'TOKEN_REVOKED' } }
    }
    return { rawBody: png, contentType: 'image/png' }
  })
  await page.goto('/')
  await expect.poll(() => covers).toBe(1)
  await page.evaluate(async () => {
    const auth = document
      .querySelector('#app')
      .__vue_app__.config.globalProperties.$pinia._s.get('auth')
    await auth.authenticate({
      loginType: 'EMAIL_PASSWORD',
      account: 'listener@example.test',
      password: 'sample-password',
    })
  })
  release()
  await expect.poll(() => covers).toBe(2)
  await expect(page.locator('.track-cover img')).toBeVisible()
  await expect(heading(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('music-web.session')).user.role,
    ),
  ).toBe('USER')
})

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [320, 740],
  [390, 844],
]) {
  test(`should_keep_library_readable_at_${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await restore(page)
    await install(page, () =>
      list({
        items: Array.from(
          { length: 20 },
          (_, index) =>
            trackPage({
              id: String(index + 1),
              title:
                index === 0
                  ? '从夏日的傍晚一路走到秋天的清晨——一首很长很长的歌曲名字'
                  : `林间来信 ${index + 1}`,
            }).items[0],
        ),
        totalElements: '43',
        totalPages: '3',
        hasNext: true,
      }),
    )
    await page.goto('/')
    await expect(heading(page)).toBeVisible()
    if (width <= 720)
      await page.getByRole('button', { name: '打开搜索' }).click()
    await expect(search(page)).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await page
        .locator('main')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    expect(
      await page
        .locator('.song-table .el-scrollbar__wrap')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await expect(
      page.getByRole('columnheader', { name: '时长', exact: true }),
    ).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`library-${width}.png`),
      fullPage: true,
    })
    await page
      .getByRole('button', { name: '下一页', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      page.getByRole('button', { name: '下一页', exact: true }),
    ).toBeInViewport()
    await search(page).focus()
    await page.keyboard.type('😀'.repeat(101))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert')).toContainText('100')
    await page.screenshot({
      path: testInfo.outputPath(`library-error-${width}.png`),
      fullPage: true,
    })
  })
}
