<script setup>
import { ref } from 'vue'
const props = defineProps({ disabled: Boolean })
const emit = defineEmits(['files-selected'])
const input = ref()
function selected(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!props.disabled && files.length) emit('files-selected', files)
}
function dropped(event) {
  const files = Array.from(event.dataTransfer?.files || [])
  if (!props.disabled && files.length) emit('files-selected', files)
}
</script>

<template>
  <div
    class="file-picker"
    data-testid="file-drop"
    @dragover.prevent
    @drop.prevent="dropped"
  >
    <span class="picker-symbol" aria-hidden="true">＋</span>
    <div class="picker-copy">
      <h2>把新的旋律带进曲库</h2>
      <p>拖入音频文件，或选择多首歌曲。导入后将创建草稿。</p>
      <p class="file-limits">MP3 / FLAC · 每个文件最大 200 MiB</p>
    </div>
    <el-button type="primary" :disabled="disabled" @click="input.click()"
      >添加文件</el-button
    >
    <input
      ref="input"
      class="native-file"
      type="file"
      multiple
      accept=".mp3,.flac"
      aria-label="选择音频文件"
      :disabled="disabled"
      @change="selected"
    />
  </div>
</template>

<style scoped>
.file-picker {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 30px;
  border: 1px dashed #adc395;
  background: #f6f8f1;
  border-radius: 6px;
}
.picker-symbol {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  font-size: 32px;
  font-weight: 300;
  color: var(--green-action);
  border: 1px solid var(--line);
  border-radius: 50%;
  background: white;
}
.picker-copy {
  flex: 1;
  min-width: 0;
}
h2 {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 20px;
  margin: 0 0 10px;
  color: var(--ink);
}
p {
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}
.file-limits {
  font-size: 12px;
  margin-top: 8px;
}
.native-file {
  display: none;
}
@media (max-width: 720px) {
  .file-picker {
    padding: 20px 16px;
    gap: 14px;
    flex-wrap: wrap;
  }
  .picker-symbol {
    width: 36px;
    height: 36px;
    font-size: 25px;
  }
  .picker-copy {
    flex-basis: calc(100% - 50px);
  }
  .file-picker :deep(.el-button) {
    width: 100%;
    margin: 0;
  }
  h2 {
    font-size: 18px;
  }
}
</style>
