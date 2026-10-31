import { describe, it, expect, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createAuthGuard } from './guards.js'
import { resolveSafeRedirect } from '../utils/redirect.js'
import { authentication } from '../test/factories.js'
import { ElMessage } from 'element-plus'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/login', name: 'login', component: {} },
    { path: '/tracks', name: 'tracks', component: {} },
    { path: '/', redirect: '/login' },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: {} },
  ],
})
describe('safe navigation', () => {
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/%5cevil.test',
    '/%00evil',
    '/login',
    '/',
    '/missing',
    '/%zz',
    null,
    ['/tracks'],
  ])('should_reject_unsafe_or_missing_target_%s', (value) => {
    expect(resolveSafeRedirect(router, value)).toBeNull()
  })
  it('should_preserve_existing_internal_query', () => {
    expect(resolveSafeRedirect(router, '/tracks?page=2')).toBe('/tracks?page=2')
  })
  it('should_redirect_anonymous_protected_navigation', () => {
    const auth = { isAuthenticated: false, clearSession: vi.fn() }
    expect(
      createAuthGuard(auth)({
        meta: { requiresAuth: true },
        fullPath: '/tracks?page=2',
      }),
    ).toEqual({ name: 'login', query: { redirect: '/tracks?page=2' } })
    expect(auth.clearSession).toHaveBeenCalled()
  })
  it('should_block_wrong_role_and_allow_public_or_authorized_route', () => {
    vi.spyOn(ElMessage, 'error').mockImplementation(() => {})
    const guard = createAuthGuard({
      isAuthenticated: true,
      session: authentication(),
    })
    expect(guard({ meta: { roles: ['ADMIN'] } })).toBe(false)
    expect(guard({ meta: { roles: ['USER'] } })).toBe(true)
    expect(guard({ meta: {} })).toBe(true)
  })
  it('should_recheck_expiration_instead_of_using_cached_authentication', () => {
    const auth = {
      isAuthenticated: true,
      session: { ...authentication(), expiresAt: '2000-01-01T00:00:00Z' },
      clearSession: vi.fn(),
    }
    expect(
      createAuthGuard(auth)({
        meta: { requiresAuth: true },
        fullPath: '/tracks',
      }).name,
    ).toBe('login')
  })
})
