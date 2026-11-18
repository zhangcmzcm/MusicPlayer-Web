import { computed, markRaw, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth.js'
import { importTrack } from '../api/trackImports.js'
import { validateImportFile } from '../utils/trackImport.js'
import { ApiError } from '../utils/errors.js'

export const useTrackImportStore = defineStore('track-import', () => {
  const auth = useAuthStore()
  const items = ref([]),
    batchState = ref('idle'),
    active = ref(false)
  const blockerId = ref(null),
    error = ref(null)
  let owner = null,
    current = null,
    localId = 0
  const counts = computed(() => {
    const result = {
      total: items.value.length,
      waiting: 0,
      invalid: 0,
      active: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      uncertain: 0,
    }
    for (const item of items.value) {
      const key = ['sending', 'processing'].includes(item.state)
        ? 'active'
        : item.state
      result[key]++
    }
    return result
  })
  function authorized() {
    return auth.isAuthenticated && auth.session.user.role === 'ADMIN'
  }
  function snapshot() {
    return { session: auth.session, revision: auth.getSessionRevision() }
  }
  function reset() {
    const previous = current
    current = null
    owner = null
    previous?.controller.abort()
    for (const item of items.value) item.file = null
    items.value = []
    active.value = false
    blockerId.value = null
    error.value = null
    batchState.value = 'idle'
  }
  function belongs() {
    return (
      authorized() &&
      owner?.session === auth.session &&
      owner.revision === auth.getSessionRevision()
    )
  }
  function ensureOwner() {
    if (owner && !belongs()) reset()
    return authorized()
  }
  watch(() => [auth.session, auth.session?.user.role], reset, { flush: 'sync' })
  onScopeDispose(reset)
  function updateBlocker() {
    blockerId.value =
      items.value.find((item) => ['blocked', 'uncertain'].includes(item.state))
        ?.id ?? null
  }
  function addFiles(files) {
    if (!ensureOwner()) return
    owner ??= snapshot()
    for (const file of files) {
      const validationMessage = validateImportFile(file)
      let uploadId = null,
        failure = null
      try {
        uploadId = crypto.randomUUID()
      } catch {
        failure = new ApiError({ code: 'CLIENT_ERROR' })
      }
      items.value.push({
        id: uploadId ?? `local-${++localId}`,
        uploadId,
        file: validationMessage ? null : markRaw(file),
        fileName: file?.name ?? '无效文件',
        size: file?.size ?? 0,
        state: validationMessage ? 'invalid' : failure ? 'blocked' : 'waiting',
        progress: null,
        result: null,
        error: failure,
        validationMessage,
        attempt: 0,
      })
      if (failure && !validationMessage) {
        error.value = failure
        batchState.value = active.value ? 'pausing' : 'paused'
      }
    }
    updateBlocker()
    if (blockerId.value) batchState.value = active.value ? 'pausing' : 'paused'
    else if (batchState.value === 'completed' && counts.value.waiting)
      batchState.value = 'idle'
  }
  function removeItem(id) {
    if (!ensureOwner()) return
    const index = items.value.findIndex(
      (item) => item.id === id && item.attempt === 0,
    )
    if (index < 0) return
    items.value[index].file = null
    items.value.splice(index, 1)
    updateBlocker()
  }
  function requestPause() {
    if (!ensureOwner()) return
    if (active.value) batchState.value = 'pausing'
    else if (counts.value.waiting || blockerId.value)
      batchState.value = 'paused'
  }
  function live(context) {
    if (current !== context) return false
    if (!belongs()) {
      reset()
      return false
    }
    return !context.controller.signal.aborted
  }
  async function send(item) {
    if (!belongs()) {
      reset()
      return false
    }
    const context = {
      controller: new AbortController(),
      item,
      attempt: ++item.attempt,
    }
    current = context
    active.value = true
    item.state = 'sending'
    item.progress = null
    item.error = null
    error.value = null
    try {
      const result = await importTrack(
        { file: item.file, uploadId: item.uploadId },
        {
          signal: context.controller.signal,
          onProgress(progress) {
            if (
              !live(context) ||
              item.attempt !== context.attempt ||
              item.state === 'processing'
            )
              return
            item.progress = progress.percent
            if (progress.sent) item.state = 'processing'
          },
        },
      )
      if (!live(context)) return false
      item.result = result
      item.state = 'succeeded'
      item.file = null
    } catch (failure) {
      if (!live(context)) return false
      const converted =
        failure instanceof ApiError
          ? failure
          : new ApiError({ code: 'CLIENT_ERROR' })
      item.error = converted
      error.value = converted
      const definiteFile = [
        [413, 'UPLOAD_TOO_LARGE'],
        [415, 'UNSUPPORTED_AUDIO_FORMAT'],
        [422, 'AUDIO_METADATA_INVALID'],
      ].some(
        ([status, code]) =>
          converted.status === status && converted.code === code,
      )
      const definiteRequest =
        (converted.status === 400 && converted.code === 'VALIDATION_FAILED') ||
        (converted.status === 409 && converted.code === 'IMPORT_CONFLICT')
      if (definiteFile || definiteRequest) {
        item.state = 'failed'
        item.file = null
        if (definiteRequest) batchState.value = 'paused'
      } else {
        item.state = [403, 429].includes(converted.status)
          ? 'blocked'
          : 'uncertain'
        batchState.value = 'paused'
      }
    } finally {
      if (current === context) {
        current = null
        active.value = false
        updateBlocker()
      }
    }
    return belongs()
  }
  async function start() {
    if (
      !ensureOwner() ||
      active.value ||
      blockerId.value ||
      !counts.value.waiting
    )
      return
    batchState.value = 'running'
    const runOwner = owner
    while (owner === runOwner && batchState.value === 'running') {
      const item = items.value.find(
        (candidate) => candidate.state === 'waiting',
      )
      if (!item) break
      if (!(await send(item))) return
    }
    if (owner !== runOwner) return
    if (batchState.value !== 'paused')
      batchState.value =
        counts.value.waiting || blockerId.value ? 'paused' : 'completed'
  }
  async function retryCurrent() {
    if (!ensureOwner() || active.value) return
    const item = items.value.find(
      (candidate) => candidate.id === blockerId.value,
    )
    if (!item) return
    if (!item.uploadId) {
      try {
        item.uploadId = crypto.randomUUID()
      } catch {
        return
      }
    }
    batchState.value = 'paused'
    const retryOwner = owner
    if (await send(item)) {
      if (owner === retryOwner) batchState.value = 'paused'
    }
  }
  return {
    items,
    batchState,
    counts,
    active,
    blockerId,
    error,
    addFiles,
    removeItem,
    start,
    requestPause,
    retryCurrent,
  }
})
