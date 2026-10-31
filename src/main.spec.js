import { it, expect, vi } from 'vitest'
import { authentication } from './test/factories.js'
import { SESSION_KEY } from './utils/session.js'
import { http } from './api/http.js'
import { ElMessage } from 'element-plus'
import { useAuthStore } from './stores/auth.js'

it('should_bootstrap_restore_session_and_handle_protected_401', async () => {
  document.body.innerHTML = '<div id="app"></div>'
  const session = authentication()
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  vi.spyOn(ElMessage, 'error').mockImplementation(() => {})
  await import('./main.js')
  const app = document.querySelector('#app').__vue_app__
  const router = app.config.globalProperties.$router
  await router.isReady()
  await router.push('/missing')
  const original = http.defaults.adapter
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
    auth.session = authentication()
    const replace = vi.spyOn(router, 'replace')
    await expect(http.get('/test-protected')).rejects.toMatchObject({
      status: 401,
    })
    expect(auth.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(replace).not.toHaveBeenCalled()
  } finally {
    http.defaults.adapter = original
    app.unmount()
  }
})
