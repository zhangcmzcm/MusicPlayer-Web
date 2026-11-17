import { computed, onScopeDispose, ref, watch } from 'vue'
import { listTracks } from '../api/tracks.js'
import { useAuthStore } from '../stores/auth.js'
import { ApiError } from '../utils/errors.js'

export function useTrackList(queryRef, { fetchPage = listTracks } = {}) {
  const auth = useAuthStore()
  const page = ref(null)
  const pending = ref(false)
  const error = ref(null)
  const now = ref(Date.now())
  const searchDeadline = ref(0)
  const retryRemaining = computed(() =>
    Math.max(0, Math.ceil((searchDeadline.value - now.value) / 1000)),
  )
  let requestNumber = 0
  let controller = null
  let limitAccount = null
  let limitError = null
  const clock = setInterval(() => {
    now.value = Date.now()
  }, 500)

  async function load() {
    const current = ++requestNumber
    controller?.abort()
    page.value = null
    pending.value = false
    error.value = null
    now.value = Date.now()
    const query = queryRef.value
    const session = auth.session
    const account = session?.user.id
    if (account !== limitAccount) {
      searchDeadline.value = 0
      limitError = null
      limitAccount = account
    }
    if (!query || !session) return
    if (query.q !== '' && retryRemaining.value > 0) {
      error.value = limitError
      return
    }
    const revision = auth.getSessionRevision()
    const request = new AbortController()
    controller = request
    const isCurrent = () =>
      current === requestNumber &&
      !request.signal.aborted &&
      auth.session === session &&
      auth.getSessionRevision() === revision
    pending.value = true
    try {
      const result = await fetchPage(query, { signal: request.signal })
      if (isCurrent()) page.value = result
    } catch (failure) {
      if (!isCurrent() || failure.code === 'CANCELLED') return
      error.value =
        failure instanceof ApiError
          ? failure
          : new ApiError({ code: 'CLIENT_ERROR' })
      if (failure.status === 429 && failure.retryAfter !== null) {
        now.value = Date.now()
        searchDeadline.value = now.value + failure.retryAfter * 1000
        limitError = error.value
      }
    } finally {
      if (isCurrent()) pending.value = false
    }
  }

  watch([queryRef, () => auth.session], load, { immediate: true })
  onScopeDispose(() => {
    requestNumber++
    controller?.abort()
    clearInterval(clock)
  })
  return {
    page,
    pending,
    error,
    retryRemaining,
    retry: () => (pending.value ? undefined : load()),
  }
}
