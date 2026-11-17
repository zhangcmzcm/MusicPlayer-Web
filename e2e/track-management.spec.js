import { test, expect } from '@playwright/test'
import { authenticated, selection, fillPassword, mockApi } from './fixtures.js'
import { trackPage, trackPageText } from '../src/test/factories.js'

const heading = (page) =>
  page.getByRole('heading', { name: '歌曲管理', exact: true })
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

async function restore(page, role = 'ADMIN') {
  await page.addInitScript(
    (session) =>
      sessionStorage.setItem('music-web.session', JSON.stringify(session)),
    authenticated(role).authentication,
  )
}
async function install(page, handler, loginRole = 'ADMIN') {
  await mockApi(
    page,
    (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/v1/auth/login')
        return { body: authenticated(loginRole) }
      expect(request.headers().authorization).toBe(
        `Bearer ${authenticated().authentication.accessToken}`,
      )
      return handler(request, url)
    },
    { defaultLibraryPage: false },
  )
}
async function status(page, label) {
  await page
    .getByRole('radiogroup', { name: '歌曲状态' })
    .getByText(label, { exact: true })
    .click()
}

test('should_login_as_ADMIN_and_browse_manage_queries_and_history', async ({
  page,
}) => {
  const requests = []
  await mockApi(
    page,
    (request) => {
      const url = new URL(request.url())
      if (request.method() === 'POST' && url.pathname.endsWith('/auth/login')) {
        return {
          body:
            request.postDataJSON().loginType === 'ROLE_SELECTION'
              ? authenticated('ADMIN')
              : selection(),
        }
      }
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe(
        `Bearer ${authenticated().authentication.accessToken}`,
      )
      const query = Object.fromEntries(url.searchParams)
      requests.push(query)
      return list({
        title: `${query.status || '全部'}第${Number(query.page) + 1}页`,
        status: query.status || 'DRAFT',
        page: Number(query.page),
        size: Number(query.size),
        totalElements: '43',
        totalPages: '3',
        hasNext: true,
      })
    },
    { defaultLibraryPage: false },
  )
  await page.goto('/login')
  await fillPassword(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: '管理员' }).click()
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: '歌曲管理', exact: true }).click()
  await expect(heading(page)).toBeVisible()
  await expect(page.getByText('全部第1页', { exact: true })).toBeVisible()
  expect(requests.at(-1)).not.toHaveProperty('status')
  await status(page, '已归档')
  await expect(page.getByText('ARCHIVED第1页', { exact: true })).toBeVisible()
  await search(page).fill(' 林间 ')
  await search(page).press('Enter')
  await expect.poll(() => requests.at(-1).q).toBe(' 林间 ')
  await page.getByRole('combobox', { name: '歌曲排序' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('option', { name: '歌名升序', exact: true }).click()
  await expect.poll(() => requests.at(-1).sort).toBe('title,asc')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('ARCHIVED第2页', { exact: true })).toBeVisible()
  await page.reload()
  await expect(search(page)).toHaveValue(' 林间 ')
  await expect(page.getByText('ARCHIVED第2页', { exact: true })).toBeVisible()
  await page.getByRole('spinbutton', { name: '每页歌曲数' }).fill('50')
  await page.getByRole('spinbutton', { name: '每页歌曲数' }).press('Tab')
  await expect.poll(() => requests.at(-1).size).toBe('50')
  expect(requests.at(-1)).toMatchObject({
    page: '0',
    status: 'ARCHIVED',
    q: ' 林间 ',
  })
  await page.goBack()
  await expect(page.getByText('ARCHIVED第2页', { exact: true })).toBeVisible()
  await status(page, '全部')
  await expect.poll(() => requests.at(-1).status).toBeUndefined()
  expect(requests.at(-1).page).toBe('0')
})

test('should_render_published_management_results_from_explicit_mock', async ({
  page,
}) => {
  await restore(page)
  const requests = []
  await install(page, (_request, url) => {
    requests.push(Object.fromEntries(url.searchParams))
    return list({
      status: url.searchParams.get('status') || 'DRAFT',
      title: '已发布管理歌曲',
    })
  })
  await page.goto('/admin/tracks')
  await status(page, '已发布')
  await expect(page.getByText('已发布管理歌曲', { exact: true })).toBeVisible()
  expect(requests.at(-1)).toEqual({
    page: '0',
    size: '20',
    sort: 'createdAt,desc',
    status: 'PUBLISHED',
  })
})

test('should_recover_USER_deep_link_without_requesting_management_scope', async ({
  page,
}) => {
  await restore(page, 'USER')
  const requests = []
  await install(page, (_request, url) => {
    requests.push(Object.fromEntries(url.searchParams))
    return list()
  })
  await page.goto('/admin/tracks?status=DRAFT')
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: '歌曲管理', exact: true }),
  ).toHaveCount(0)
  expect(requests).toEqual([
    { page: '0', size: '20', sort: 'createdAt,desc', status: 'PUBLISHED' },
  ])
})

test('should_recover_management_redirect_after_ADMIN_account_selects_USER', async ({
  page,
}) => {
  await mockApi(
    page,
    (request) => {
      if (request.method() === 'POST')
        return {
          body:
            request.postDataJSON().loginType === 'ROLE_SELECTION'
              ? authenticated('USER')
              : selection(),
        }
      expect(new URL(request.url()).searchParams.get('status')).toBe(
        'PUBLISHED',
      )
      return list()
    },
    { defaultLibraryPage: false },
  )
  await page.goto('/admin/tracks?status=ARCHIVED')
  await fillPassword(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('button', { name: /用户身份/ }).click()
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: '歌曲管理', exact: true }),
  ).toHaveCount(0)
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('music-web.session')).user.role,
    ),
  ).toBe('USER')
})

test('should_show_forbidden_and_return_to_real_library', async ({ page }) => {
  await restore(page)
  await install(page, (_request, url) =>
    url.searchParams.get('status') === 'PUBLISHED'
      ? list()
      : {
          status: 403,
          body: { code: 'FORBIDDEN', detail: 'private database path' },
        },
  )
  await page.goto('/admin/tracks')
  await expect(page.getByRole('alert')).toContainText('权限')
  await expect(page.getByText('private database path')).toHaveCount(0)
  await page.getByRole('link', { name: '返回曲库' }).click()
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('music-web.session')).user.role,
    ),
  ).toBe('ADMIN')
})

test('should_preserve_Long_null_and_authorized_cover_for_draft', async ({
  page,
}) => {
  await restore(page)
  const id = '9223372036854775807'
  const covers = []
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
    'base64',
  )
  await install(page, (_request, url) => {
    if (url.pathname === '/api/v1/tracks')
      return list({
        id,
        status: 'DRAFT',
        albumName: null,
        durationMs: null,
        cover: {
          url: `/api/v1/tracks/${id}/cover`,
          contentType: 'image/png',
          sizeBytes: '68',
        },
        totalElements: id,
        totalPages: id,
      })
    covers.push(url.pathname)
    return { rawBody: png, contentType: 'image/png' }
  })
  await page.goto('/admin/tracks')
  await expect(page.getByText('未标注专辑', { exact: true })).toBeVisible()
  await expect(page.getByText('--:--', { exact: true })).toBeVisible()
  await expect(page.getByText(`共 ${id} 首`).first()).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.track-cover img')
        .evaluateAll(
          (images) =>
            images.filter((img) => img.complete && img.naturalWidth > 0).length,
        ),
    )
    .toBe(1)
  expect(covers).toEqual([`/api/v1/tracks/${id}/cover`])
})

test('should_recover_legal_empty_page_and_invalid_status', async ({ page }) => {
  await restore(page)
  await install(page, (_request, url) =>
    list({
      status: 'DRAFT',
      page: Number(url.searchParams.get('page')),
      items:
        url.searchParams.get('page') === '0'
          ? trackPage({ status: 'DRAFT' }).items
          : [],
      totalElements: '1',
    }),
  )
  await page.goto('/admin/tracks?status=DRAFT&page=2')
  await expect(page.getByText('当前页暂无歌曲', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: '页码', exact: true }),
  ).toHaveValue('3')
  await page.getByRole('button', { name: '回到第一页' }).click()
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await page.goto('/admin/tracks?status=ALL')
  await expect(page.getByRole('alert')).toContainText('查询条件无效')
  await page.getByRole('button', { name: '恢复默认条件' }).click()
  await expect(page).toHaveURL(/\/admin\/tracks$/)
})

test('should_clear_limited_search_without_losing_status', async ({ page }) => {
  await restore(page)
  const requests = []
  await install(page, (_request, url) => {
    requests.push(Object.fromEntries(url.searchParams))
    if (url.searchParams.get('q'))
      return {
        status: 429,
        body: { code: 'TRACK_SEARCH_RATE_LIMITED' },
        headers: { 'Retry-After': '60' },
      }
    return list({ status: 'ARCHIVED' })
  })
  await page.goto('/admin/tracks?status=ARCHIVED&q=林间')
  await expect(page.getByRole('alert')).toContainText('搜索过于频繁')
  await expect(
    page.getByRole('radio', { name: '草稿', exact: true }),
  ).toBeDisabled()
  await search(page).fill('')
  await search(page).press('Enter')
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  expect(requests.at(-1)).toEqual({
    status: 'ARCHIVED',
    page: '0',
    size: '20',
    sort: 'createdAt,desc',
  })
})

for (const failure of ['network', 'service']) {
  test(`should_retry_management_${failure}_failure`, async ({ page }) => {
    await restore(page)
    let count = 0
    await install(page, () =>
      ++count === 1
        ? { status: 503, body: { code: 'TRACK_STORE_UNAVAILABLE' } }
        : list(),
    )
    if (failure === 'network')
      await page.route('**/api/v1/tracks?**', async (route) => {
        await page.unroute('**/api/v1/tracks?**')
        await route.abort('connectionreset')
      })
    await page.goto('/admin/tracks')
    await expect(page.getByRole('alert')).toContainText(
      failure === 'network' ? '网络连接失败' : '曲库暂时无法读取',
    )
    if (failure === 'network') count = 1
    await page.getByRole('button', { name: '重试读取曲库' }).click()
    await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  })
}

test('should_clear_current_session_on_management_401', async ({ page }) => {
  await restore(page)
  await install(page, () => ({ status: 401, body: { code: 'TOKEN_REVOKED' } }))
  await page.goto('/admin/tracks?status=DRAFT')
  await expect(page.getByTestId('login-submit')).toBeVisible()
  expect(
    await page.evaluate(() => sessionStorage.getItem('music-web.session')),
  ).toBeNull()
  await expect(page).toHaveURL(/redirect=.*admin/)
})

test('should_discard_old_management_401_after_same_token_new_session', async ({
  page,
}) => {
  await restore(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let calls = 0
  await install(page, async () => {
    calls++
    if (calls === 1) {
      await gate
      return { status: 401, body: { code: 'TOKEN_REVOKED' } }
    }
    return list({ status: 'DRAFT' })
  })
  await page.goto('/admin/tracks')
  await expect.poll(() => calls).toBe(1)
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
  await expect(page.getByText('风经过的地方', { exact: true })).toBeVisible()
  await expect(heading(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('music-web.session')).user.role,
    ),
  ).toBe('ADMIN')
})

test('should_distinguish_all_single_state_and_search_empty_results', async ({
  page,
}) => {
  await restore(page)
  await install(page, () =>
    list({ items: [], totalElements: '0', totalPages: '0' }),
  )
  await page.goto('/admin/tracks')
  await expect(page.getByText('暂无歌曲', { exact: true })).toBeVisible()
  await status(page, '草稿')
  await expect(
    page.getByText('当前状态暂无歌曲', { exact: true }),
  ).toBeVisible()
  await search(page).fill('没有的歌曲')
  await search(page).press('Enter')
  await expect(
    page.getByText('没有找到相关歌曲', { exact: true }),
  ).toBeVisible()
})

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [1024, 768],
  [320, 740],
  [390, 844],
]) {
  test(`should_keep_management_and_sidebar_readable_at_${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await restore(page)
    await install(page, (_request, url) =>
      list({
        items: Array.from(
          { length: 20 },
          (_, index) =>
            trackPage({
              id: String(index + 1),
              status:
                url.searchParams.get('status') ||
                ['DRAFT', 'PUBLISHED', 'ARCHIVED'][index % 3],
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
    if (width <= 720) {
      await page.getByRole('button', { name: '打开侧边导航' }).click()
      await page
        .getByRole('navigation', { name: '手机侧边导航' })
        .getByRole('link', { name: '歌曲管理' })
        .click()
      await expect(
        page.getByRole('button', { name: '打开侧边导航' }),
      ).toHaveAttribute('aria-expanded', 'false')
    } else
      await page.getByRole('link', { name: '歌曲管理', exact: true }).click()
    await expect(heading(page)).toBeVisible()
    await expect(page.getByText('林间来信 2', { exact: true })).toBeVisible()
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
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    expect(
      await page
        .locator('.song-table .el-scrollbar__wrap')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    await expect(
      page.getByRole('columnheader', { name: '时长', exact: true }),
    ).toBeInViewport()
    await expect(page.locator('.track-status').first()).toBeInViewport()
    expect(
      await page
        .getByRole('cell', { name: '14', exact: true })
        .locator('.cell')
        .evaluate(
          (el) =>
            el.clientHeight <= parseFloat(getComputedStyle(el).lineHeight) + 1,
        ),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`management-${width}.png`),
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
      path: testInfo.outputPath(`management-error-${width}.png`),
      fullPage: true,
    })
    if (width === 1024) {
      await page.getByRole('link', { name: '音乐', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: '曲库', exact: true }),
      ).toBeVisible()
      expect(
        await page
          .locator('.song-table .el-scrollbar__wrap')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
  })
}
