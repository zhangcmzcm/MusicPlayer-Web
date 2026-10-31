import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { login } from '../api/auth.js'
import { ApiError } from '../utils/errors.js'
import { reportError } from '../utils/logger.js'
import {
  readSession,
  writeSession,
  clearSession as removeSession,
  isValidSession,
  isFutureInstant,
} from '../utils/session.js'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null),
    roleSelection = ref(null),
    pending = ref(false),
    error = ref(null)
  let generation = 0
  const isAuthenticated = computed(() => isValidSession(session.value))
  function storage() {
    try {
      return window.sessionStorage
    } catch {
      throw new ApiError({ code: 'STORAGE_UNAVAILABLE' })
    }
  }
  function authFailure(failure) {
    if (failure instanceof ApiError) return failure
    const converted = new ApiError({ code: 'CLIENT_ERROR' })
    reportError(converted)
    return converted
  }
  function restoreSession() {
    try {
      session.value = readSession(storage())
    } catch (failure) {
      error.value = authFailure(failure)
      session.value = null
    }
  }
  function clearRoleSelection() {
    roleSelection.value = null
  }
  function clearSession() {
    generation++
    session.value = null
    roleSelection.value = null
    pending.value = false
    try {
      removeSession(storage())
    } catch (failure) {
      error.value = authFailure(failure)
    }
  }
  async function authenticate(payload, { signal } = {}) {
    if (pending.value) return null
    const current = ++generation
    pending.value = true
    error.value = null
    try {
      const result = await login(payload, { signal })
      if (current !== generation || signal?.aborted) return null
      if (result.status === 'AUTHENTICATED') {
        writeSession(storage(), result.authentication)
        session.value = result.authentication
        clearRoleSelection()
      } else {
        session.value = null
        removeSession(storage())
        roleSelection.value = result.roleSelection
      }
      return result
    } catch (failure) {
      if (current !== generation || signal?.aborted) return null
      error.value = authFailure(failure)
      if (error.value.code === 'LOGIN_TICKET_INVALID') clearRoleSelection()
      throw error.value
    } finally {
      if (current === generation) pending.value = false
    }
  }
  async function selectRole(role, options = {}) {
    if (!['USER', 'ADMIN'].includes(role))
      throw new ApiError({ code: 'INVALID_ROLE_SELECTION' })
    if (
      !roleSelection.value ||
      !isFutureInstant(roleSelection.value.expiresAt)
    ) {
      clearRoleSelection()
      throw new ApiError({ code: 'LOGIN_TICKET_INVALID', status: 401 })
    }
    return authenticate(
      {
        loginType: 'ROLE_SELECTION',
        loginTicket: roleSelection.value.loginTicket,
        loginRole: role,
      },
      options,
    )
  }
  return {
    session,
    roleSelection,
    pending,
    error,
    isAuthenticated,
    restoreSession,
    authenticate,
    selectRole,
    clearSession,
    clearRoleSelection,
  }
})
