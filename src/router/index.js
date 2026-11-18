import { createRouter, createWebHistory } from 'vue-router'
import { createAuthGuard } from './guards.js'

export function createAppRouter(auth) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/',
        component: () => import('../components/layout/BusinessLayout.vue'),
        meta: { requiresAuth: true },
        children: [
          {
            path: 'admin/tracks/import',
            name: 'track-import',
            component: () => import('../views/management/TrackImportView.vue'),
            meta: {
              requiresAuth: true,
              roles: ['ADMIN'],
              activeNavigation: 'track-management',
            },
          },
          {
            path: 'admin/tracks',
            name: 'track-management',
            component: () =>
              import('../views/management/TrackManagementView.vue'),
            meta: {
              requiresAuth: true,
              roles: ['ADMIN'],
              navigation: { section: 'sidebar', label: '歌曲管理', order: 20 },
            },
          },
          {
            path: '',
            name: 'library',
            component: () => import('../views/library/LibraryView.vue'),
            meta: { navigation: { section: 'top', label: '音乐', order: 0 } },
          },
        ],
      },
      {
        path: '/forgot-password',
        name: 'forgot-password',
        component: () =>
          import('../views/password-reset/PasswordResetView.vue'),
      },
      {
        path: '/',
        name: 'auth-scene',
        component: () => import('../components/auth/AuthScene.vue'),
        children: [
          {
            path: 'login',
            name: 'login',
            component: () => import('../views/login/LoginView.vue'),
          },
          {
            path: 'register',
            name: 'register',
            component: () => import('../views/register/RegisterView.vue'),
          },
        ],
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: () => import('../views/NotFoundView.vue'),
      },
    ],
    scrollBehavior: () => ({ top: 0 }),
  })
  router.beforeEach(createAuthGuard(auth))
  return router
}
