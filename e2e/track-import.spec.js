import { test, expect } from '@playwright/test'
import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { authenticated, fillPassword, mockApi } from './fixtures.js'
import {
  deferred,
  importResponseText,
  trackPageText,
} from '../src/test/factories.js'

const audio = (name = '晨光.mp3') => ({
  name,
  mimeType: name.endsWith('.flac') ? 'audio/flac' : 'audio/mpeg',
  buffer: Buffer.from(`audio:${name}`),
})
const heading = (page) =>
  page.getByRole('heading', { name: '批量导入', exact: true })
const row = (page, name) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) })
const errors = new WeakMap()
test.beforeEach(({ page }) => {
  const messages = []
  errors.set(page, messages)
  page.on('pageerror', (error) => messages.push(error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))
async function restore(page, role = 'ADMIN') {
  await page.addInitScript(
    (session) =>
      sessionStorage.setItem('music-web.session', JSON.stringify(session)),
    authenticated(role).authentication,
  )
}
async function multipart(request) {
  const form = await new Request(request.url(), {
    method: 'POST',
    headers: { 'content-type': request.headers()['content-type'] },
    body: request.postDataBuffer(),
  }).formData()
  expect([...form.keys()].sort()).toEqual(['file', 'uploadId'])
  const file = form.get('file')
  return {
    uploadId: form.get('uploadId'),
    name: file.name,
    type: file.type,
    bytes: Buffer.from(await file.arrayBuffer()).toString(),
  }
}
async function install(page, upload, role = 'ADMIN') {
  await mockApi(
    page,
    async (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/auth/login'))
        return { body: authenticated(role) }
      expect(request.headers().authorization).toBe(
        `Bearer ${authenticated().authentication.accessToken}`,
      )
      if (request.method() === 'GET' && url.pathname === '/api/v1/tracks')
        return {
          rawBody: trackPageText({
            status: url.searchParams.get('status') || 'DRAFT',
            page: Number(url.searchParams.get('page')),
            size: Number(url.searchParams.get('size')),
          }),
        }
      expect(request.method()).toBe('POST')
      expect(url.pathname).toBe('/api/v1/track-imports')
      const payload = await multipart(request)
      return upload(payload)
    },
    { defaultLibraryPage: false },
  )
}
const success = (payload, extra = {}) => ({
  status: 201,
  rawBody: importResponseText({ uploadId: payload.uploadId, ...extra }),
})
const choose = (page, files) =>
  page.getByLabel('选择音频文件').setInputFiles(files)

test('should_import_multiple_files_append_pause_return_and_open_drafts', async ({
  page,
}) => {
  await restore(page)
  const received = [],
    gate = deferred()
  await install(page, async (payload) => {
    received.push(payload)
    if (received.length === 1) await gate.promise
    return success(payload, { metadataWarnings: ['COVER_MISSING'] })
  })
  try {
    await page.goto(
      '/admin/tracks?q=%20林间%20&status=ARCHIVED&page=2&size=50&sort=id,asc',
    )
    await page.getByRole('link', { name: '上传歌曲' }).click()
    await expect(heading(page)).toBeFocused()
    await expect(
      page
        .getByRole('navigation', { name: '侧边导航', exact: true })
        .getByRole('link', { name: '歌曲管理' }),
    ).toHaveAttribute('aria-current', 'page')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '添加文件' }).focus()
    await page.keyboard.press('Enter')
    await (
      await chooser
    ).setFiles([audio(), audio('第二首.flac'), audio('无效.txt')])
    await expect
      .poll(() =>
        page.getByLabel('选择音频文件').evaluate((input) => input.files.length),
      )
      .toBe(0)
    await expect(row(page, '无效.txt')).toContainText('本地校验未通过')
    expect(received).toHaveLength(0)
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect.poll(() => received.length).toBe(1)
    await choose(page, [audio('追加.mp3')])
    await page.getByRole('button', { name: '返回歌曲管理' }).click()
    await expect(page).toHaveURL(/status=ARCHIVED/)
    expect(new URL(page.url()).searchParams.get('q')).toBe(' 林间 ')
    await page.getByRole('link', { name: '上传歌曲' }).click()
    await expect(page.getByRole('status')).toContainText('完成当前项后暂停')
    gate.resolve()
    await expect(row(page, '晨光.mp3')).toContainText('已导入')
    expect(received).toHaveLength(1)
    await expect(heading(page)).toBeFocused()
    await row(page, '晨光.mp3').getByText('1 条导入提示').click()
    await expect(
      row(page, '晨光.mp3').getByText('未找到内嵌封面。'),
    ).toBeVisible()
    await page.getByRole('button', { name: '继续导入' }).click()
    await expect(row(page, '追加.mp3')).toContainText('已导入')
    expect(received.map((item) => item.name)).toEqual([
      '晨光.mp3',
      '第二首.flac',
      '追加.mp3',
    ])
    expect(new Set(received.map((item) => item.uploadId)).size).toBe(3)
    await page.getByRole('button', { name: '查看草稿' }).click()
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
      status: 'DRAFT',
      size: '50',
      sort: 'id,asc',
    })
  } finally {
    gate.resolve()
  }
})

test('should_replay_unknown_result_with_identical_key_filename_and_bytes', async ({
  page,
}) => {
  await restore(page)
  const received = []
  await install(page, (payload) => {
    received.push(payload)
    return { ...success(payload), status: 200 }
  })
  let first = true
  await page.route('**/api/v1/track-imports', async (route) => {
    if (!first) return route.fallback()
    first = false
    received.push(await multipart(route.request()))
    await route.abort('failed')
  })
  await page.goto('/admin/tracks/import')
  await choose(page, [audio(), audio('later.mp3')])
  await page.getByRole('button', { name: '开始导入', exact: true }).click()
  await expect(row(page, '晨光.mp3')).toContainText('结果待确认')
  await page.getByRole('button', { name: '重试当前项' }).click()
  await expect(row(page, '晨光.mp3')).toContainText('已导入')
  expect(received).toHaveLength(2)
  expect(received[1]).toEqual(received[0])
  await expect(row(page, 'later.mp3')).toContainText('等待')
  await page.getByRole('button', { name: '继续导入' }).click()
  await expect(row(page, 'later.mp3')).toContainText('已导入')
})

for (const [status, code] of [
  [413, 'UPLOAD_TOO_LARGE'],
  [415, 'UNSUPPORTED_AUDIO_FORMAT'],
  [422, 'AUDIO_METADATA_INVALID'],
]) {
  test(`should_continue_after_${status}_file_rejection`, async ({ page }) => {
    await restore(page)
    let count = 0
    await install(page, (payload) =>
      ++count === 1 ? { status, body: { code } } : success(payload),
    )
    await page.goto('/admin/tracks/import')
    await choose(page, [audio(), audio('next.mp3')])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(row(page, '晨光.mp3')).toContainText('导入失败')
    await expect(row(page, 'next.mp3')).toContainText('已导入')
  })
}
for (const [status, code] of [
  [400, 'VALIDATION_FAILED'],
  [403, 'FORBIDDEN'],
  [409, 'IMPORT_CONFLICT'],
  [429, 'TRACK_IMPORT_RATE_LIMITED'],
  [503, 'MEDIA_IMPORT_STORE_UNAVAILABLE'],
]) {
  test(`should_pause_and_offer_manual_recovery_for_${status}`, async ({
    page,
  }) => {
    await restore(page)
    let count = 0
    await install(page, (payload) =>
      ++count === 1
        ? { status, body: { code }, headers: { 'retry-after': '1' } }
        : success(payload),
    )
    await page.goto('/admin/tracks/import')
    await choose(page, [audio(), audio('next.mp3')])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已暂停')
    await expect(row(page, 'next.mp3')).toContainText('等待')
    expect(count).toBe(1)
    if ([403, 429, 503].includes(status)) {
      await page.getByRole('button', { name: '重试当前项' }).click()
      await expect(row(page, '晨光.mp3')).toContainText('已导入')
    }
    await page.getByRole('button', { name: '继续导入' }).click()
    await expect(row(page, 'next.mp3')).toContainText('已导入')
  })
}

test('should_separate_transfer_progress_from_server_processing', async ({
  page,
}) => {
  await restore(page)
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function (body) {
      if (body instanceof FormData && body.has('uploadId'))
        window.importProgress = (loaded, total) =>
          this.upload.dispatchEvent(
            new ProgressEvent('progress', {
              loaded,
              total,
              lengthComputable: total > 0,
            }),
          )
      return send.call(this, body)
    }
  })
  const gate = deferred()
  await install(page, async (payload) => {
    await gate.promise
    return success(payload)
  })
  try {
    await page.goto('/admin/tracks/import')
    await choose(page, [audio()])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await page.waitForFunction(() => window.importProgress)
    await page.evaluate(() => window.importProgress(50, 100))
    await expect(
      page.getByRole('progressbar', { name: '晨光.mp3 发送进度' }),
    ).toHaveAttribute('aria-valuenow', '50')
    await page.evaluate(() => window.importProgress(100, 100))
    await expect(row(page, '晨光.mp3')).toContainText('服务端处理')
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    gate.resolve()
    await expect(row(page, '晨光.mp3')).toContainText('已导入')
  } finally {
    gate.resolve()
  }
})

test('should_clear_current_401_and_return_to_import_after_admin_login', async ({
  page,
}) => {
  await restore(page)
  let count = 0
  await install(page, (payload) =>
    ++count === 1
      ? { status: 401, body: { code: 'INVALID_TOKEN' } }
      : success(payload),
  )
  await page.goto('/admin/tracks/import?size=50')
  await choose(page, [audio()])
  await page.getByRole('button', { name: '开始导入', exact: true }).click()
  await expect(page.getByTestId('email-input')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(
    '/admin/tracks/import?size=50',
  )
  await fillPassword(page)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(heading(page)).toBeVisible()
  await expect(page.getByText('选择文件后在这里查看导入队列')).toBeVisible()
})
test('should_hide_import_from_USER_and_redirect_initial_visit_to_library', async ({
  page,
}) => {
  await restore(page, 'USER')
  await install(
    page,
    () => {
      throw Error('unauthorized upload')
    },
    'USER',
  )
  await page.goto('/admin/tracks/import')
  await expect(
    page.getByRole('heading', { name: '曲库', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '上传歌曲' })).toHaveCount(0)
})

test('should_discard_old_upload_after_same_token_new_session', async ({
  page,
}) => {
  await restore(page)
  const gate = deferred()
  let count = 0
  await install(page, async (payload) => {
    count++
    if (count === 1) {
      await gate.promise
      return { status: 401, body: { code: 'INVALID_TOKEN' } }
    }
    return success(payload)
  })
  try {
    await page.goto('/admin/tracks/import')
    await choose(page, [audio()])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect.poll(() => count).toBe(1)
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
    gate.resolve()
    await expect(page.getByText('选择文件后在这里查看导入队列')).toBeVisible()
    await choose(page, [audio('new.mp3')])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(row(page, 'new.mp3')).toContainText('已导入')
    await expect(heading(page)).toBeVisible()
  } finally {
    gate.resolve()
  }
})
test('should_accept_200_MiB_and_reject_one_byte_more_before_upload', async ({
  page,
}, info) => {
  const paths = [info.outputPath('limit.mp3'), info.outputPath('oversize.mp3')]
  await mkdir(dirname(paths[0]), { recursive: true })
  for (const [index, path] of paths.entries()) {
    const handle = await open(path, 'w')
    try {
      await handle.truncate(209715200 + index)
    } finally {
      await handle.close()
    }
  }
  await restore(page)
  let calls = 0
  await install(page, (payload) => {
    calls++
    return success(payload)
  })
  await page.goto('/admin/tracks/import')
  await page.getByLabel('选择音频文件').setInputFiles(paths)
  await expect(row(page, 'limit.mp3')).toContainText('等待')
  await expect(row(page, 'oversize.mp3')).toContainText('每个文件最大 200 MiB')
  await page
    .getByRole('button', { name: '移除 limit.mp3', exact: true })
    .click()
  await page
    .getByRole('button', { name: '移除 oversize.mp3', exact: true })
    .click()
  expect(calls).toBe(0)
})

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [1024, 768],
  [320, 740],
  [390, 844],
]) {
  test(`should_keep_import_controls_readable_at_${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await restore(page)
    await install(page, (payload) =>
      success(payload, {
        metadataWarnings: ['COVER_MISSING', 'TITLE_FALLBACK'],
      }),
    )
    await page.goto('/admin/tracks/import?page=-1')
    await choose(page, [
      audio('很长的歌曲文件名称'.repeat(8) + '.mp3'),
      audio('invalid.txt'),
    ])
    await page.getByRole('button', { name: '开始导入', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已完成')
    await page.getByText('2 条导入提示').click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await expect(
      page.getByRole('button', { name: '查看草稿' }),
    ).toBeInViewport()
    await page.screenshot({
      path: `.superpowers/track-import-${width}.png`,
      fullPage: true,
    })
    if (width < 720) {
      await page.getByRole('button', { name: '打开侧边导航' }).click()
      await page
        .getByRole('navigation', { name: '手机侧边导航' })
        .getByRole('link', { name: '歌曲管理' })
        .click()
      await expect(
        page.getByRole('heading', { name: '歌曲管理', exact: true }),
      ).toBeVisible()
    }
  })
}
