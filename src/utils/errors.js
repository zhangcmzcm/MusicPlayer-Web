export const errorMessages = {
  PASSWORD_RESET_REQUEST_RATE_LIMITED: '找回密码申请过于频繁，请稍后重试。',
  PASSWORD_RESET_REQUEST_UNAVAILABLE: '找回密码申请服务暂时不可用。',
  PASSWORD_RESET_VERIFICATION_RATE_LIMITED: '验证码验证过于频繁，请稍后重试。',
  PASSWORD_RESET_VERIFICATION_UNAVAILABLE: '验证码验证服务暂时不可用。',
  PASSWORD_RESET_CONFIRMATION_RATE_LIMITED: '密码重置过于频繁，请稍后重试。',
  PASSWORD_RESET_CONFIRMATION_UNAVAILABLE: '密码重置服务暂时不可用。',
  PASSWORD_RESET_VERIFICATION_FAILED:
    '验证码或找回申请无效，请检查或重新申请。',
  NEW_PASSWORD_SAME_AS_OLD: '新密码不能与原密码相同，请更换密码。',
  USERNAME_ALREADY_EXISTS: '该用户名已被使用，请更换用户名。',
  EMAIL_ALREADY_EXISTS: '该邮箱已被使用，请更换邮箱或尝试登录。',
  USER_ALREADY_EXISTS: '账户信息已被使用，请检查后重试。',
  EMAIL_CODE_INVALID: '验证码无效或已过期，请重新获取。',
  EMAIL_CODE_ALREADY_USED: '验证码已被使用，请重新获取。',
  EMAIL_CODE_ATTEMPTS_EXCEEDED: '验证码错误次数达到限制，请重新获取。',
  VALIDATION_FAILED: '请检查填写的信息后重试。',
  INVALID_CREDENTIALS: '登录信息不正确，请检查后重试。',
  LOGIN_TICKET_INVALID: '身份选择已过期，请重新登录。',
  ROLE_SELECTION_NOT_ALLOWED: '你没有使用该身份的权限。',
  LOGIN_RATE_LIMITED: '登录操作过于频繁，请稍后重试。',
  SEND_CODE_TOO_FREQUENTLY: '验证码发送过于频繁，请稍后重试。',
  EMAIL_SEND_FAILED: '邮件发送失败，请稍后重新发送。',
  AUTH_STATE_STORE_UNAVAILABLE: '登录服务暂时不可用，请稍后重试。',
  VERIFICATION_CODE_STORE_UNAVAILABLE: '验证码服务暂时不可用，请稍后重试。',
  INTERNAL_ERROR: '服务暂时异常，请稍后重试。',
  TOKEN_REVOKED: '登录状态已失效，请重新登录。',
  NETWORK_ERROR: '网络连接失败，请检查网络后重试。',
  TIMEOUT: '请求超时，请稍后重试。',
  STORAGE_UNAVAILABLE: '浏览器无法保存登录状态，请检查存储设置后重试。',
  CLIENT_ERROR: '暂时无法完成操作，请稍后重试。',
  INVALID_ROLE_SELECTION: '请选择有效的登录身份。',
  INVALID_RESPONSE: '服务返回的信息异常，请稍后重试。',
  CANCELLED: '操作已取消。',
}

export function getErrorMessage(error) {
  if (Object.hasOwn(errorMessages, error?.code))
    return errorMessages[error.code]
  const statusMessages = {
    400: '请检查填写的信息后重试。',
    401: '登录状态已失效，请重新登录。',
    403: '你没有执行此操作的权限。',
    404: '请求的资源不存在。',
    409: '操作发生冲突，请确认当前状态后重试。',
    429: '操作过于频繁，请稍后重试。',
  }
  return (
    statusMessages[error?.status] ||
    (error?.status >= 500
      ? '服务暂时异常，请稍后重试。'
      : '暂时无法完成操作，请稍后重试。')
  )
}

export class ApiError extends Error {
  constructor({
    code = 'UNKNOWN',
    status = 0,
    retryAfter = null,
    scope = null,
  } = {}) {
    super(getErrorMessage({ code, status }))
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.detail = this.message
    this.retryAfter = retryAfter
    this.scope = scope
  }
}
