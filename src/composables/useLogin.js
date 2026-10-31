import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { sendLoginCode } from '../api/auth.js'
import { ApiError } from '../utils/errors.js'

export const loginMethods = {
  EMAIL_PASSWORD: '邮箱密码登录',
  USERNAME_PASSWORD: '用户名密码登录',
  EMAIL_CODE: '邮箱验证码登录',
}

export function useLogin(auth) {
  const form = reactive({ email: '', username: '', password: '', code: '' })
  const loginType = ref('EMAIL_PASSWORD'),
    sending = ref(false),
    error = ref(auth.error),
    codeNotice = ref(''),
    selectedRole = ref(null)
  const now = ref(Date.now()),
    sendDeadlines = reactive(new Map()),
    globalSendDeadline = ref(0),
    loginDeadline = ref(0)
  const validating = ref(false)
  const busy = computed(() => auth.pending || sending.value || validating.value)
  const step = computed(() =>
    auth.isAuthenticated
      ? 'success'
      : auth.roleSelection
        ? 'role-selection'
        : 'login',
  )
  const normalizedEmail = computed(() => form.email.trim().toLowerCase())
  const remaining = (deadline) =>
    Math.max(0, Math.ceil((deadline - now.value) / 1000))
  const sendRemaining = computed(() =>
    remaining(
      Math.max(
        globalSendDeadline.value,
        sendDeadlines.get(normalizedEmail.value) || 0,
      ),
    ),
  )
  const loginRemaining = computed(() => remaining(loginDeadline.value))
  const rules = {
    email: [
      { required: true, message: '请输入邮箱地址', trigger: 'blur' },
      {
        validator: (_, value, done) => {
          const email = value.trim()
          done(
            email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
              ? undefined
              : new Error('请输入有效邮箱，最多 120 个字符'),
          )
        },
        trigger: 'blur',
      },
    ],
    username: [
      { required: true, message: '请输入用户名', trigger: 'blur' },
      { min: 3, max: 80, message: '用户名需为 3–80 个字符', trigger: 'blur' },
    ],
    password: [
      { required: true, message: '请输入密码', trigger: 'blur' },
      { min: 8, max: 128, message: '密码需为 8–128 个字符', trigger: 'blur' },
    ],
    code: [
      { required: true, message: '请输入验证码', trigger: 'blur' },
      { pattern: /^\d{6}$/, message: '请输入 6 位数字验证码', trigger: 'blur' },
    ],
  }
  let controller = null,
    disposed = false
  function newRequest() {
    controller?.abort()
    controller = new AbortController()
    return controller
  }
  function clearSensitive() {
    form.password = ''
    form.code = ''
  }
  function changeMethod(type) {
    if (busy.value || !Object.hasOwn(loginMethods, type)) return
    loginType.value = type
    clearSensitive()
    error.value = null
    codeNotice.value = ''
  }
  function fail(failure) {
    if (disposed || failure.code === 'CANCELLED') return
    error.value = failure
    if (failure.code === 'LOGIN_TICKET_INVALID') auth.clearRoleSelection()
    if (failure.status === 429 && failure.retryAfter !== null)
      loginDeadline.value = Date.now() + failure.retryAfter * 1000
  }
  async function submit(formRef) {
    if (busy.value || loginRemaining.value) return
    validating.value = true
    try {
      if (!(await formRef?.validate()) || disposed) return
      const request = newRequest()
      const payload =
        loginType.value === 'EMAIL_CODE'
          ? {
              loginType: loginType.value,
              email: normalizedEmail.value,
              code: form.code,
            }
          : {
              loginType: loginType.value,
              account:
                loginType.value === 'USERNAME_PASSWORD'
                  ? form.username
                  : normalizedEmail.value,
              password: form.password,
            }
      error.value = null
      const result = await auth.authenticate(payload, {
        signal: request.signal,
      })
      if (!disposed && !request.signal.aborted && result) clearSensitive()
    } catch (failure) {
      fail(failure)
    } finally {
      validating.value = false
    }
  }
  async function sendCode(formRef) {
    if (busy.value || sendRemaining.value) return
    validating.value = true
    let request
    const email = normalizedEmail.value
    try {
      if (!(await formRef?.validateEmail()) || disposed) return
      request = newRequest()
      sending.value = true
      error.value = null
      codeNotice.value = ''
      const response = await sendLoginCode(email, { signal: request.signal })
      if (disposed || request.signal.aborted) return
      now.value = Date.now()
      sendDeadlines.set(email, now.value + 60000)
      if (normalizedEmail.value === email)
        codeNotice.value = '验证码已发送，请及时查收。'
      // UTC 截止时间由服务端返回；有效期提示不延长客户端发送冷却。
      codeExpiry = Date.parse(response.expiresAt)
    } catch (failure) {
      if (disposed || request?.signal.aborted || failure.code === 'CANCELLED')
        return
      error.value = failure
      if (failure.status === 429 && failure.retryAfter !== null) {
        now.value = Date.now()
        const deadline = now.value + failure.retryAfter * 1000
        if (
          failure.scope === 'EMAIL_COOLDOWN' ||
          failure.scope === 'EMAIL_DAILY_LIMIT'
        )
          sendDeadlines.set(email, deadline)
        else globalSendDeadline.value = deadline
      }
    } finally {
      if (!disposed) sending.value = false
      validating.value = false
    }
  }
  async function selectRole(role) {
    if (busy.value || loginRemaining.value) return
    const request = newRequest()
    selectedRole.value = role
    error.value = null
    try {
      await auth.selectRole(role, { signal: request.signal })
    } catch (failure) {
      fail(failure)
    } finally {
      if (!disposed) selectedRole.value = null
    }
  }
  function restart() {
    controller?.abort()
    auth.clearSession()
    clearSensitive()
    error.value = auth.error?.code === 'STORAGE_UNAVAILABLE' ? auth.error : null
  }
  let codeExpiry = 0
  const timer = setInterval(() => {
    now.value = Date.now()
    if (codeExpiry && now.value >= codeExpiry) {
      codeNotice.value = ''
      codeExpiry = 0
    }
    if (
      auth.roleSelection &&
      now.value >= Date.parse(auth.roleSelection.expiresAt)
    ) {
      restart()
      error.value = new ApiError({ code: 'LOGIN_TICKET_INVALID' })
    }
    if (auth.session && now.value >= Date.parse(auth.session.expiresAt)) {
      restart()
      error.value = new ApiError({ code: 'TOKEN_REVOKED' })
    }
  }, 500)
  watch(normalizedEmail, () => {
    codeNotice.value = ''
  })
  onScopeDispose(() => {
    disposed = true
    clearInterval(timer)
    controller?.abort()
    clearSensitive()
    auth.clearRoleSelection()
  })
  return {
    form,
    loginType,
    busy,
    sending,
    error,
    codeNotice,
    selectedRole,
    step,
    rules,
    sendRemaining,
    loginRemaining,
    changeMethod,
    submit,
    sendCode,
    selectRole,
    restart,
  }
}
