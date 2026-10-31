import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './assets/main.css'
import App from './App.vue'
import { useAuthStore } from './stores/auth.js'
import { createAppRouter } from './router/index.js'
import { configureAuth } from './api/http.js'

const app = createApp(App),
  pinia = createPinia()
app.use(pinia)
const auth = useAuthStore(pinia)
auth.restoreSession()
const router = createAppRouter(auth)
configureAuth({
  getSession: () => auth.session,
  onUnauthorized: () => {
    auth.clearSession()
    ElMessage.error('登录状态已失效，请重新登录。')
    if (router.currentRoute.value.name !== 'login')
      router.replace({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
  },
})
app.use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
