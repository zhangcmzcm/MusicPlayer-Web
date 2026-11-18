<script setup>
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import {
  isNavigationFailure,
  NavigationFailureType,
  onBeforeRouteLeave,
  useRoute,
  useRouter,
} from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useTrackImportStore } from '../../stores/trackImport.js'
import ImportFilePicker from '../../components/management/ImportFilePicker.vue'
import ImportQueue from '../../components/management/ImportQueue.vue'
import { managementReturnTarget } from '../../utils/trackList.js'
import { ApiError, getErrorMessage } from '../../utils/errors.js'
const auth = useAuthStore(),
  store = useTrackImportStore()
const route = useRoute(),
  router = useRouter()
const isAdmin = computed(
  () => auth.isAuthenticated && auth.session.user.role === 'ADMIN',
)
const heading = ref(),
  navigationError = ref(null)
let disposed = false
onMounted(() => heading.value?.focus({ preventScroll: true }))
watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    if (!disposed) heading.value?.focus({ preventScroll: true })
  },
)
onScopeDispose(() => {
  disposed = true
})
onBeforeRouteLeave(() => {
  store.requestPause()
})
async function returnToManagement(drafts = false) {
  navigationError.value = null
  try {
    const failure = await router.push(
      managementReturnTarget(route.query, { drafts }),
    )
    if (
      failure &&
      !isNavigationFailure(failure, NavigationFailureType.cancelled) &&
      !disposed
    )
      navigationError.value = new ApiError({ code: 'CLIENT_ERROR' })
  } catch {
    if (!disposed)
      navigationError.value = new ApiError({ code: 'CLIENT_ERROR' })
  }
}
</script>

<template>
  <section class="import-view">
    <header class="import-heading">
      <div>
        <p class="section-label">歌曲管理 / 导入</p>
        <h1 ref="heading" tabindex="-1">批量导入</h1>
        <p class="intro">从音频文件读取歌曲信息，逐首创建草稿。</p>
      </div>
      <el-button aria-label="返回歌曲管理" @click="returnToManagement()"
        >返回歌曲管理</el-button
      >
    </header>
    <p v-if="navigationError" class="error-text" role="alert">
      {{ getErrorMessage(navigationError) }}
    </p>
    <template v-if="isAdmin">
      <ImportFilePicker @files-selected="store.addFiles" />
      <ImportQueue
        :items="store.items"
        :counts="store.counts"
        :batch-state="store.batchState"
        :active="store.active"
        :blocker-id="store.blockerId"
        :error="store.error"
        @start="store.start"
        @pause-requested="store.requestPause"
        @retry-requested="store.retryCurrent"
        @item-removed="store.removeItem"
        @drafts-requested="returnToManagement(true)"
      />
    </template>
    <div v-else class="permission-error" role="alert">
      <p>你没有执行此操作的权限。</p>
      <RouterLink :to="{ name: 'library' }">返回曲库</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.import-view {
  max-width: 1320px;
  margin: 0 auto;
  padding: 31px 40px 40px;
  color: var(--ink);
}
.import-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 28px;
}
.section-label {
  margin: 0 0 14px;
  color: var(--ink-muted);
  font-size: 12px;
}
h1 {
  font-family: var(--font-serif);
  font-size: 29px;
  font-weight: 400;
  letter-spacing: 2px;
  margin: 0;
}
h1:focus {
  outline: none;
}
h1:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 6px;
}
.intro {
  font-size: 13px;
  color: var(--ink-muted);
  margin: 12px 0 0;
  line-height: 1.7;
}
.error-text {
  color: var(--error-color);
  font-size: 13px;
}
.permission-error {
  text-align: center;
  padding: 60px 0;
  color: var(--error-color);
}
.permission-error a {
  color: var(--green-action);
}
@media (max-width: 720px) {
  .import-view {
    padding: 24px 14px 30px;
  }
  h1 {
    font-size: 26px;
  }
  .import-heading {
    margin-bottom: 22px;
  }
}
</style>
