import { expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { resolveSafeRedirect } from './redirect.js'

const component = { template: '<p />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/forgot-password', name: 'forgot-password', component },
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component },
    { path: '/register', name: 'register', component },
    { path: '/destination', name: 'destination', component },
    { path: '/:pathMatch(.*)*', name: 'not-found', component },
  ],
})
it.each([
  '/register',
  '/forgot-password',
  '/forgot-password?redirect=/destination',
  '/register?redirect=/destination',
  '/login',
  '/',
  '/reg%69ster',
  '//example.test',
  '/%2fexample.test',
  '/%5cprivate',
  'https://example.test',
  '/unknown',
])('should_reject_auth_or_unsafe_redirect_%s', (path) => {
  expect(resolveSafeRedirect(router, path)).toBeNull()
})
it('should_preserve_safe_destination_query_and_hash', () => {
  expect(resolveSafeRedirect(router, '/destination?sort=name#section')).toBe(
    '/destination?sort=name#section',
  )
})
