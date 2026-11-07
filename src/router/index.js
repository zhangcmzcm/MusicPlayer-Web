import { createRouter, createWebHistory } from 'vue-router'
import { createAuthGuard } from './guards.js'

export function createAppRouter(auth) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/',
        name: 'auth-scene',
        component: () => import('../components/auth/AuthScene.vue'),
        children: [
          { path: '', name: 'auth-entry', redirect: { name: 'login' } },
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
