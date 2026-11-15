import { it, expect, vi } from 'vitest'
import { authentication, trackPageText } from './test/factories.js'
import { SESSION_KEY } from './utils/session.js'
import { http } from './api/http.js'
import { ElMessage } from 'element-plus'
import { useAuthStore } from './stores/auth.js'

it('should_bootstrap_restore_session_and_handle_protected_401', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const session = authentication()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  vi.spyOn(ElMessage, 'error').mockImplementation(() => {})
  const original = http.defaults.adapter
  http.defaults.adapter = async (config) => ({
    config,
    status: 200,
    headers: {},
    data: trackPageText({ items: [], totalElements: '0', totalPages: '0' }),
  })
  await import('./main.js')
  const app = document.querySelector('#app').__vue_app__
  const router = app.config.globalProperties.$router
  await router.isReady()
  await router.push('/missing')
  http.defaults.adapter = async (config) => {
    throw {
      config,
      response: { status: 401, data: { code: 'TOKEN_REVOKED' }, headers: {} },
    }
  }
  try {
    await expect(http.get('/test-protected')).rejects.toMatchObject({
      status: 401,
    })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(router.currentRoute.value.query.redirect).toBe('/missing')
    expect(ElMessage.error).toHaveBeenCalled()
    const auth = useAuthStore(app.config.globalProperties.$pinia)
    const removeGuard = router.beforeEach((to) => to.name !== 'library')
    auth.session = authentication()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const replace = vi.spyOn(router, 'replace')
    await expect(http.get('/test-protected')).rejects.toMatchObject({
      status: 401,
    })
    expect(auth.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(replace).not.toHaveBeenCalled()
    removeGuard()
  } finally {
    http.defaults.adapter = original
    app.unmount()
  }
})
