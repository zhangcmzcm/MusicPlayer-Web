import { ElMessage } from 'element-plus'
import { isValidSession } from '../utils/session.js'

export function createAuthGuard(auth) {
  return (to) => {
    if (
      to.meta.requiresAuth &&
      (!auth.isAuthenticated || !isValidSession(auth.session))
    ) {
      auth.clearSession()
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.roles && !to.meta.roles.includes(auth.session?.user.role)) {
      ElMessage.error('你没有访问此页面的权限。')
      return false
    }
    return true
  }
}
