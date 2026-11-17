<script setup>
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import {
  isNavigationFailure,
  NavigationFailureType,
  useRoute,
  useRouter,
} from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { listManagementTracks } from '../../api/tracks.js'
import LibraryToolbar from '../../components/library/LibraryToolbar.vue'
import TrackTable from '../../components/library/TrackTable.vue'
import { useTrackList } from '../../composables/useTrackList.js'
import {
  DEFAULT_MANAGEMENT_QUERY,
  TRACK_STATUS_OPTIONS,
  parseManagementQuery,
  toManagementQuery,
} from '../../utils/trackList.js'
import { ApiError, getErrorMessage } from '../../utils/errors.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isAdmin = computed(() => auth.session?.user.role === 'ADMIN')
const parsed = computed(() => parseManagementQuery(route.query))
const query = computed(() => (isAdmin.value ? parsed.value.query : null))
const displayQuery = computed(() => query.value || DEFAULT_MANAGEMENT_QUERY)
const { page, pending, error, retryRemaining, retry } = useTrackList(query, {
  fetchPage: listManagementTracks,
})
const forbidden = computed(() => !isAdmin.value || error.value?.status === 403)
const limited = computed(
  () => displayQuery.value.q !== '' && retryRemaining.value > 0,
)
const selectedStatus = computed(() => displayQuery.value.status || 'ALL')
const emptyText = computed(() =>
  displayQuery.value.status ? '当前状态暂无歌曲' : '暂无歌曲',
)
const heading = ref()
const navigationError = ref(null)
let disposed = false
onScopeDispose(() => {
  disposed = true
})

async function navigate(nextQuery) {
  navigationError.value = null
  const previous = query.value
  if (
    previous &&
    ['q', 'page', 'size', 'sort', 'status'].every(
      (key) => previous[key] === nextQuery[key],
    )
  ) {
    return retry()
  }
  try {
    const failure = await router.push({
      name: 'track-management',
      query: toManagementQuery(nextQuery),
    })
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
function statusChanged(value) {
  const nextQuery = { ...displayQuery.value, page: 0 }
  delete nextQuery.status
  if (value !== 'ALL') nextQuery.status = value
  return navigate(nextQuery)
}
function search(raw) {
  return navigate({ ...displayQuery.value, q: raw, page: 0 })
}
function sortChanged(sort) {
  return navigate({ ...displayQuery.value, sort, page: 0 })
}
function sizeChanged(size) {
  return navigate({ ...displayQuery.value, size, page: 0 })
}
function pageChanged(page) {
  return navigate({ ...displayQuery.value, page })
}
function resetQuery() {
  return navigate({ ...DEFAULT_MANAGEMENT_QUERY })
}
function focusHeading() {
  heading.value?.focus({ preventScroll: true })
}
onMounted(focusHeading)
watch(
  () => route.fullPath,
  async () => {
    await nextTick()
    if (!disposed) focusHeading()
  },
)
</script>

<template>
  <section class="management-view" data-testid="management-view">
    <div class="management-heading">
      <h1 ref="heading" tabindex="-1">歌曲管理</h1>
      <p v-if="page && !forbidden" class="library-count">
        共 {{ page.totalElements }} 首
      </p>
      <LibraryToolbar
        v-if="!forbidden"
        :query="displayQuery"
        :pending="pending"
        :retry-remaining="retryRemaining"
        @search-submitted="search"
        @sort-changed="sortChanged"
        @size-changed="sizeChanged"
      />
    </div>
    <div v-if="forbidden" class="query-error" role="alert">
      <p>你没有执行此操作的权限。</p>
      <RouterLink :to="{ name: 'library' }">返回曲库</RouterLink>
    </div>
    <template v-else>
      <el-radio-group
        :model-value="selectedStatus"
        aria-label="歌曲状态"
        :disabled="limited"
        class="status-filter"
        @change="statusChanged"
      >
        <el-radio-button value="ALL">全部</el-radio-button>
        <el-radio-button
          v-for="option in TRACK_STATUS_OPTIONS"
          :key="option.value"
          :value="option.value"
          >{{ option.label }}</el-radio-button
        >
      </el-radio-group>
      <p v-if="displayQuery.q" class="query-description">
        “{{ displayQuery.q }}”的搜索结果
      </p>
      <div v-if="parsed.error" class="query-error" role="alert">
        <p>{{ getErrorMessage(parsed.error) }}</p>
        <el-button aria-label="恢复默认条件" @click="resetQuery"
          >恢复默认条件</el-button
        >
      </div>
      <template v-else>
        <p v-if="navigationError" class="navigation-error" role="alert">
          {{ getErrorMessage(navigationError) }}
        </p>
        <TrackTable
          show-status
          :empty-text="emptyText"
          :page="page"
          :query="displayQuery"
          :pending="pending"
          :error="error"
          :retry-remaining="retryRemaining"
          @page-changed="pageChanged"
          @retry="retry"
          @reset-page="pageChanged(0)"
        />
      </template>
    </template>
  </section>
</template>

<style scoped>
.management-view {
  max-width: 1480px;
  margin: 0 auto;
  padding: 31px 40px 40px;
}
.management-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 17px;
  margin-bottom: 26px;
}
h1 {
  font-family: var(--font-serif);
  font-size: 29px;
  font-weight: 400;
  letter-spacing: 2px;
  margin: 0;
  color: var(--ink);
}
h1:focus {
  outline: none;
}
h1:focus-visible {
  outline: 2px solid var(--green-action);
  outline-offset: 6px;
  border-radius: 2px;
}
.library-count {
  color: var(--ink-muted);
  font-size: 12px;
  margin: 0;
}
.status-filter {
  margin: 0 0 24px;
  max-width: 100%;
}
.query-error a {
  color: var(--green-action);
  text-underline-offset: 4px;
}
.query-description {
  font-size: 12px;
  color: var(--ink-muted);
  margin: -8px 0 20px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.query-error {
  min-height: 270px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  font-size: 14px;
  color: var(--error-color);
}
.navigation-error {
  font-size: 13px;
  color: var(--error-color);
}
@media (max-width: 720px) {
  .management-view {
    padding: 26px 14px 30px;
  }
  .management-heading {
    gap: 14px;
    margin-bottom: 22px;
  }
  h1 {
    font-size: 26px;
  }
}
</style>
