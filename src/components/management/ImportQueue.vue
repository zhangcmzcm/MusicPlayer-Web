<script setup>
import { computed } from 'vue'
import { formatImportFileSize } from '../../utils/trackImport.js'
import { getErrorMessage } from '../../utils/errors.js'
const props = defineProps({
  items: { type: Array, required: true },
  counts: { type: Object, required: true },
  batchState: { type: String, required: true },
  active: Boolean,
  blockerId: { type: String, default: null },
  error: { type: Object, default: null },
})
defineEmits([
  'start',
  'pause-requested',
  'retry-requested',
  'item-removed',
  'drafts-requested',
])
const batchLabels = {
  idle: '待开始',
  running: '运行中',
  pausing: '完成当前项后暂停',
  paused: '已暂停',
  completed: '已完成',
}
const labels = {
  waiting: '等待',
  invalid: '本地校验未通过',
  sending: '正在发送',
  processing: '服务端处理',
  succeeded: '已导入',
  failed: '导入失败',
  blocked: '待重试',
  uncertain: '结果待确认',
}
const startLabel = computed(() =>
  props.batchState === 'paused' ? '继续导入' : '开始导入',
)
const canStart = computed(
  () => !props.active && !props.blockerId && props.counts.waiting > 0,
)
const summary = computed(() =>
  [
    ['succeeded', '已导入'],
    ['waiting', '等待'],
    ['active', '处理中'],
    ['blocked', '待重试'],
    ['uncertain', '待确认'],
    ['failed', '导入失败'],
    ['invalid', '校验未通过'],
  ]
    .filter(([key]) => props.counts[key] > 0)
    .map(([key, label]) => `${label} ${props.counts[key]}`)
    .join(' · '),
)
</script>

<template>
  <section class="import-queue" aria-label="导入队列">
    <div class="queue-actions">
      <div class="queue-heading">
        <h2>
          导入队列 <span>{{ counts.total }}</span>
        </h2>
        <p role="status">
          {{ batchLabels[batchState]
          }}<span v-if="summary"> · {{ summary }}</span>
        </p>
      </div>
      <div class="action-buttons">
        <el-button
          v-if="active"
          :disabled="batchState !== 'running'"
          aria-label="完成当前项后暂停"
          @click="$emit('pause-requested')"
          >完成当前项后暂停</el-button
        >
        <el-button
          v-else
          type="primary"
          :aria-label="startLabel"
          :disabled="!canStart"
          @click="$emit('start')"
          >{{ startLabel }}</el-button
        >
        <el-button
          v-if="blockerId"
          :disabled="active"
          aria-label="重试当前项"
          @click="$emit('retry-requested')"
          >重试当前项</el-button
        >
        <el-button
          v-if="counts.succeeded"
          aria-label="查看草稿"
          @click="$emit('drafts-requested')"
          >查看草稿</el-button
        >
      </div>
    </div>
    <p v-if="!items.length" class="queue-empty">选择文件后在这里查看导入队列</p>
    <ol v-else class="queue-list">
      <li
        v-for="item in items"
        :key="item.id"
        class="queue-row"
        :data-state="item.state"
      >
        <div class="file-info">
          <p class="file-name">{{ item.fileName }}</p>
          <p v-if="item.result" class="song-info">
            {{ item.result.track.title }} · {{ item.result.track.artistName }}
          </p>
          <span class="mobile-size">{{ formatImportFileSize(item.size) }}</span>
        </div>
        <span class="file-size">{{ formatImportFileSize(item.size) }}</span>
        <div class="file-state">
          <span :class="['state-label', item.state]">{{
            labels[item.state]
          }}</span>
          <el-progress
            v-if="item.state === 'sending' && item.progress !== null"
            :percentage="item.progress"
            :aria-label="`${item.fileName} 发送进度`"
            :stroke-width="4"
          />
          <p
            v-if="item.state === 'sending' && item.progress === null"
            class="state-note"
          >
            正在传输文件…
          </p>
          <p v-if="item.state === 'processing'" class="state-note">
            文件已发送，正在提取歌曲信息…
          </p>
          <p v-if="item.validationMessage" class="state-note error-text">
            {{ item.validationMessage }}
          </p>
          <p v-if="item.error" class="state-note error-text">
            {{ getErrorMessage(item.error)
            }}<span v-if="item.error.retryAfter">
              请至少等待 {{ item.error.retryAfter }} 秒后手动重试。</span
            >
          </p>
          <details v-if="item.result?.warnings.length" class="warnings">
            <summary>{{ item.result.warnings.length }} 条导入提示</summary>
            <ul>
              <li v-for="warning in item.result.warnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
          </details>
        </div>
        <div class="row-actions">
          <el-button
            v-if="item.attempt === 0"
            text
            :aria-label="`移除 ${item.fileName}`"
            @click="$emit('item-removed', item.id)"
            >移除</el-button
          >
        </div>
      </li>
    </ol>
    <p
      v-if="error && !items.some((item) => item.error === error)"
      class="error-text"
      role="alert"
    >
      {{ getErrorMessage(error) }}
    </p>
    <p class="memory-note">
      队列仅保留在当前标签页内。切换页面会在当前歌曲完成后暂停；刷新或关闭页面会丢失队列，请先核对导入结果。
    </p>
  </section>
</template>

<style scoped>
.import-queue {
  margin-top: 28px;
  color: var(--ink);
}
.queue-actions {
  position: sticky;
  top: 0;
  z-index: 2;
  background: white;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}
.queue-heading {
  min-width: 0;
  flex: 1;
}
h2 {
  font-size: 17px;
  font-weight: 500;
  margin: 0 0 8px;
}
h2 span {
  color: var(--ink-muted);
  font-size: 13px;
  margin-left: 8px;
}
.queue-heading p {
  font-size: 12px;
  color: var(--ink-muted);
  margin: 0;
  line-height: 1.7;
}
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-buttons :deep(.el-button) {
  margin: 0;
}
.queue-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.queue-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px minmax(180px, 0.8fr) 56px;
  gap: 20px;
  align-items: start;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}
.file-info,
.file-state {
  min-width: 0;
}
.file-name {
  font-size: 14px;
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.song-info {
  font-size: 12px;
  color: var(--ink-muted);
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.file-size {
  color: var(--ink-muted);
  font-size: 12px;
  line-height: 24px;
}
.mobile-size {
  display: none;
}
.state-label {
  font-size: 13px;
  line-height: 24px;
}
.succeeded {
  color: var(--green-action);
}
.failed,
.invalid {
  color: var(--error-color);
}
.uncertain,
.blocked {
  color: #896b26;
}
.state-note {
  font-size: 12px;
  line-height: 1.7;
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.error-text {
  color: var(--error-color);
}
.file-state :deep(.el-progress) {
  margin-top: 4px;
}
.warnings {
  font-size: 12px;
  line-height: 1.8;
  margin-top: 6px;
  color: var(--ink-muted);
}
.warnings summary {
  color: var(--green-action);
  cursor: pointer;
}
.warnings ul {
  padding-left: 17px;
  margin: 5px 0 0;
}
.row-actions :deep(.el-button) {
  padding: 4px;
  height: auto;
  min-height: 28px;
}
.queue-empty {
  padding: 64px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--ink-muted);
  border-bottom: 1px solid var(--line);
}
.memory-note {
  color: var(--ink-muted);
  font-size: 12px;
  line-height: 1.8;
  margin: 18px 0;
}
@media (max-width: 1000px) {
  .queue-row {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 1fr) 40px;
    gap: 12px;
  }
  .file-size {
    display: none;
  }
  .mobile-size {
    display: inline-block;
    color: var(--ink-muted);
    font-size: 12px;
    margin-top: 7px;
  }
}
@media (max-width: 520px) {
  .queue-heading {
    flex-basis: 100%;
  }
  .action-buttons {
    width: 100%;
  }
  .queue-row {
    grid-template-columns: minmax(0, 1fr) 40px;
    gap: 8px;
    padding: 18px 0;
  }
  .file-state {
    grid-row: 2;
  }
  .row-actions {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
