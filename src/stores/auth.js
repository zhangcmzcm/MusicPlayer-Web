import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { login } from '../api/auth.js'
import { ApiError } from '../utils/errors.js'
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
  function restoreSession() {
    try {
      session.value = readSession(window.sessionStorage)
    } catch (failure) {
      error.value =
        failure instanceof ApiError
          ? failure
          : new ApiError({ code: 'STORAGE_UNAVAILABLE' })
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
      removeSession(window.sessionStorage)
    } catch (failure) {
      error.value =
        failure instanceof ApiError
          ? failure
          : new ApiError({ code: 'STORAGE_UNAVAILABLE' })
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
        writeSession(window.sessionStorage, result.authentication)
        session.value = result.authentication
        clearRoleSelection()
      } else {
        session.value = null
        removeSession(window.sessionStorage)
        roleSelection.value = result.roleSelection
      }
      return result
    } catch (failure) {
      if (current !== generation || signal?.aborted) return null
      error.value =
        failure instanceof ApiError
          ? failure
          : new ApiError({ code: 'STORAGE_UNAVAILABLE' })
      if (error.value.code === 'LOGIN_TICKET_INVALID') clearRoleSelection()
      throw error.value
    } finally {
      if (current === generation) pending.value = false
    }
  }
  async function selectRole(role, options = {}) {
    if (!['USER', 'ADMIN'].includes(role))
      throw new ApiError({ code: 'ROLE_SELECTION_NOT_ALLOWED', status: 403 })
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
