<script setup>
import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { getErrorMessage } from '../../utils/errors.js'
import { formatDuration, formatTrackStatus } from '../../utils/trackList.js'
import TrackCover from './TrackCover.vue'

const props = defineProps({
  page: { type: Object, default: null },
  query: { type: Object, required: true },
  pending: Boolean,
  error: { type: Object, default: null },
  retryRemaining: { type: Number, default: 0 },
  showStatus: Boolean,
  emptyText: { type: String, default: '' },
})
const emit = defineEmits(['page-changed', 'retry', 'reset-page'])
const compactMedia = window.matchMedia('(max-width: 1100px)')
const compact = ref(compactMedia.matches)
function updateCompact(event) {
  compact.value = event.matches
}
compactMedia.addEventListener('change', updateCompact)
onScopeDispose(() => compactMedia.removeEventListener('change', updateCompact))
const pageForm = ref()
const pageInput = reactive({ page: String(props.query.page + 1) })
const maxPageNumber = computed(() => Math.floor(10000 / props.query.size) + 1)
const canNext = computed(
  () =>
    Boolean(props.page?.hasNext) &&
    (props.query.page + 1) * props.query.size <= 10000,
)
const limited = computed(() => props.query.q !== '' && props.retryRemaining > 0)
const emptyPage = computed(
  () =>
    props.page && props.query.page > 0 && BigInt(props.page.totalElements) > 0n,
)
const emptyMessage = computed(() =>
  emptyPage.value
    ? '当前页暂无歌曲'
    : props.query.q
      ? '没有找到相关歌曲'
      : props.emptyText || '曲库暂时没有歌曲',
)
const pageRules = {
  page: [
    {
      validator: (_rule, value, done) => {
        const number = Number(value)
        const valid =
          /^\d+$/.test(value) &&
          Number.isSafeInteger(number) &&
          number >= 1 &&
          number <= maxPageNumber.value
        done(
          valid
            ? undefined
            : new Error(`请输入 1—${maxPageNumber.value} 之间的页码`),
        )
      },
      trigger: 'blur',
    },
  ],
}

async function jump() {
  if (await pageForm.value.validate().catch(() => false))
    emit('page-changed', Number(pageInput.page) - 1)
}
watch(
  () => props.query.page,
  async (value) => {
    pageInput.page = String(value + 1)
    await nextTick()
    pageForm.value?.clearValidate()
  },
)
function position(index) {
  return props.query.page * props.query.size + index + 1
}
function secondaryText(track) {
  return `${track.artistName} / ${track.albumName || '未标注专辑'}`
}
</script>

<template>
  <section class="track-list" :aria-busy="pending" aria-label="歌曲列表">
    <div v-if="pending" class="list-state" role="status">
      <span class="loading-leaf" aria-hidden="true"></span>正在读取曲库…
    </div>
    <div v-else-if="error" class="list-state error-state" role="alert">
      <p>{{ getErrorMessage(error) }}</p>
      <el-button
        aria-label="重试读取曲库"
        :disabled="limited"
        @click="emit('retry')"
        >重试</el-button
      >
    </div>
    <div
      v-else-if="!page || !page.items.length"
      class="list-state"
      role="status"
    >
      <p>{{ emptyMessage }}</p>
      <el-button
        v-if="emptyPage"
        aria-label="回到第一页"
        @click="emit('reset-page')"
        >回到第一页</el-button
      >
      <p v-else-if="query.q" class="empty-hint">试试更换关键词，或清空搜索。</p>
    </div>
    <el-table
      v-else
      :data="page.items"
      row-key="id"
      class="song-table"
      table-layout="fixed"
    >
      <el-table-column
        type="index"
        :index="position"
        :width="compact ? 40 : 48"
        label="序号"
      />
      <el-table-column label="歌曲" :min-width="compact ? 165 : 240">
        <template #default="{ row }">
          <div class="song-name">
            <TrackCover :track-id="row.id" :enabled="Boolean(row.cover)" />
            <div class="song-copy">
              <span class="song-title" :title="row.title">{{ row.title }}</span
              ><span
                v-if="compact"
                class="song-secondary"
                :title="secondaryText(row)"
                >{{ secondaryText(row) }}</span
              >
              <span
                v-if="showStatus && compact"
                class="track-status"
                :class="row.status.toLowerCase()"
                >{{ formatTrackStatus(row.status) }}</span
              >
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-if="!compact"
        prop="artistName"
        label="艺术家"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="!compact"
        label="专辑"
        min-width="160"
        show-overflow-tooltip
        ><template #default="{ row }">{{
          row.albumName || '未标注专辑'
        }}</template></el-table-column
      >
      <el-table-column v-if="showStatus && !compact" label="状态" width="90">
        <template #default="{ row }"
          ><span class="track-status" :class="row.status.toLowerCase()">{{
            formatTrackStatus(row.status)
          }}</span></template
        >
      </el-table-column>
      <el-table-column label="时长" :width="compact ? 63 : 88"
        ><template #default="{ row }"
          ><span class="duration" :title="formatDuration(row.durationMs)">{{
            formatDuration(row.durationMs)
          }}</span></template
        ></el-table-column
      >
    </el-table>
    <footer v-if="page && !pending && !error" class="pagination">
      <p class="page-statistics">
        共 {{ page.totalElements }} 首<span>共 {{ page.totalPages }} 页</span>
      </p>
      <div class="page-actions">
        <el-button
          aria-label="上一页"
          :disabled="query.page === 0 || limited"
          @click="emit('page-changed', query.page - 1)"
          >上一页</el-button
        >
        <el-form
          ref="pageForm"
          :model="pageInput"
          :rules="pageRules"
          class="page-form"
          novalidate
          @submit.prevent="jump"
        >
          <span>第</span
          ><el-form-item prop="page"
            ><el-input
              v-model="pageInput.page"
              aria-label="页码"
              inputmode="numeric"
              :disabled="limited" /></el-form-item
          ><span>页</span
          ><el-button
            native-type="submit"
            :disabled="limited"
            aria-label="前往指定页"
            >前往</el-button
          >
        </el-form>
        <el-button
          aria-label="下一页"
          :disabled="!canNext || limited"
          @click="emit('page-changed', query.page + 1)"
          >下一页</el-button
        >
      </div>
    </footer>
  </section>
</template>

<style scoped>
.track-list {
  min-width: 0;
}
.song-table {
  --el-table-border-color: #e6ecdf;
  --el-table-header-text-color: #607153;
  --el-table-text-color: #30492f;
  --el-table-row-hover-bg-color: #f2f7e9;
  font-size: 13px;
}
.song-table :deep(th.el-table__cell) {
  font-weight: 400;
  font-size: 12px;
  height: 40px;
}
.song-table :deep(td.el-table__cell) {
  height: 68px;
}
.song-table :deep(.cell) {
  padding: 0 12px;
}
.song-table :deep(.el-table__cell:first-child .cell) {
  padding: 0 3px;
  font-size: 11px;
  white-space: nowrap;
}
.song-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}
.song-name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.song-copy {
  min-width: 0;
}
.song-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-status {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 3px;
  background: #edf3e5;
  color: #526547;
  font-size: 11px;
  line-height: 19px;
  white-space: nowrap;
}
.track-status.published {
  color: #315632;
  background: #e2efda;
}
.track-status.archived {
  color: #5c6558;
  background: #eef0ea;
}
.song-secondary {
  display: block;
  color: var(--ink-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 5px;
}
.duration {
  display: block;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-state {
  min-height: 270px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--ink-muted);
  font-size: 14px;
}
.list-state p {
  margin: 0;
}
.error-state {
  color: var(--error-color);
}
.empty-hint {
  font-size: 12px;
}
.loading-leaf {
  width: 17px;
  height: 24px;
  border: 1px solid #8da779;
  border-radius: 100% 0 100% 0;
  background: #e6efcb;
  transform: rotate(18deg);
}
.pagination {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 24px;
  font-size: 12px;
  color: var(--ink-muted);
}
.page-statistics {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}
.page-statistics span {
  display: inline-block;
  margin-left: 15px;
}
.page-actions,
.page-form {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.page-actions :deep(.el-button) {
  margin: 0;
}
.page-form > span {
  padding-top: 8px;
}
.page-form :deep(.el-form-item) {
  width: 58px;
  margin: 0;
}
.page-form :deep(.el-input__wrapper) {
  min-height: 32px;
  border-radius: 5px;
  padding: 0 5px;
}
.page-form :deep(.el-input__inner) {
  height: 30px;
  text-align: center;
}
.page-form :deep(.el-form-item__error) {
  min-width: 180px;
}
@media (max-width: 720px) {
  .song-table {
    font-size: 12px;
  }
  .song-table :deep(.cell) {
    padding: 0 5px;
  }
  .song-table :deep(td.el-table__cell) {
    height: 74px;
  }
  .song-name {
    gap: 9px;
  }
  .song-name :deep(.track-cover) {
    width: 36px;
    height: 36px;
  }
  .song-copy {
    max-width: calc(100% - 45px);
  }
  .duration {
    font-size: 11px;
  }
  .pagination {
    gap: 16px;
  }
  .page-actions {
    width: 100%;
    gap: 7px;
    justify-content: space-between;
  }
  .page-actions :deep(.el-button) {
    padding: 8px 9px;
    font-size: 12px;
  }
  .page-form {
    gap: 6px;
  }
  .page-form :deep(.el-form-item) {
    width: 42px;
  }
}
</style>
