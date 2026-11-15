<script setup>
import { computed, reactive, ref, useId, watch } from 'vue'
import {
  LIBRARY_SORT_OPTIONS,
  validateTrackSearch,
} from '../../utils/trackList.js'

const props = defineProps({
  query: { type: Object, required: true },
  pending: Boolean,
  retryRemaining: { type: Number, default: 0 },
})
const emit = defineEmits(['search-submitted', 'sort-changed', 'size-changed'])
const form = reactive({ q: props.query.q })
const formRef = ref()
const validating = ref(false)
const composing = ref(false)
const searchOpen = ref(false)
const errorId = `${useId()}-search-error`
const searchLimited = computed(() => form.q !== '' && props.retryRemaining > 0)
const blocked = computed(
  () =>
    validating.value ||
    searchLimited.value ||
    (props.pending && form.q === props.query.q),
)
const filtersLimited = computed(
  () => props.query.q !== '' && props.retryRemaining > 0,
)
const searchInvalid = computed(
  () => formRef.value?.getField('q')?.validateState === 'error',
)
const rules = {
  q: [
    {
      validator: (_rule, value, done) => {
        const message = validateTrackSearch(value)
        done(message ? new Error(message) : undefined)
      },
      trigger: 'blur',
    },
  ],
}

async function submit() {
  if (blocked.value || composing.value) return
  validating.value = true
  try {
    if (await formRef.value.validate().catch(() => false))
      emit('search-submitted', form.q)
  } finally {
    validating.value = false
  }
}
function clearSearch() {
  form.q = ''
  formRef.value.clearValidate()
  emit('search-submitted', '')
}
function sizeChanged(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 100)
    emit('size-changed', value)
}
watch(
  () => props.query.q,
  (value) => {
    form.q = value
    formRef.value?.clearValidate()
  },
)
</script>

<template>
  <Teleport defer to="#business-search">
    <div class="search-container" :class="{ 'is-open': searchOpen }">
      <el-button
        class="mobile-search-toggle"
        text
        :aria-label="searchOpen ? '收起搜索' : '打开搜索'"
        :aria-expanded="searchOpen"
        @click="searchOpen = !searchOpen"
      >
        <span class="search-symbol" aria-hidden="true"></span>
      </el-button>
      <el-form
        ref="formRef"
        class="library-search"
        :model="form"
        :rules="rules"
        novalidate
        @submit.prevent="submit"
        @keydown.enter="
          ($event.isComposing || $event.keyCode === 229) &&
          $event.preventDefault()
        "
        @compositionstart="composing = true"
        @compositionend="composing = false"
      >
        <el-form-item prop="q" label="搜索音乐" class="search-field">
          <el-input
            v-model="form.q"
            aria-label="搜索音乐"
            placeholder="搜索歌曲、艺术家、专辑"
            clearable
            :aria-invalid="searchInvalid"
            :aria-describedby="searchInvalid ? errorId : undefined"
            @clear="clearSearch"
          />
          <template #error="{ error }"
            ><span :id="errorId" class="el-form-item__error" role="alert">{{
              error
            }}</span></template
          >
        </el-form-item>
        <el-button
          native-type="submit"
          :disabled="blocked"
          class="search-submit"
          >搜索</el-button
        >
      </el-form>
    </div>
  </Teleport>
  <div class="library-controls">
    <el-select
      :model-value="query.sort"
      :options="LIBRARY_SORT_OPTIONS"
      aria-label="歌曲排序"
      class="sort-control"
      :disabled="filtersLimited"
      @change="emit('sort-changed', $event)"
    />
    <label class="size-control"
      >每页<el-input-number
        :model-value="query.size"
        aria-label="每页歌曲数"
        :min="1"
        :max="100"
        :precision="0"
        :controls="false"
        :disabled="filtersLimited"
        @change="sizeChanged"
      /><span>首</span></label
    >
    <span v-if="retryRemaining" class="search-cooldown" role="status"
      >{{ retryRemaining }} 秒后可搜索</span
    >
  </div>
</template>

<style scoped>
.search-container {
  width: 100%;
}
.library-search {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}
.search-field {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.search-field :deep(.el-form-item__label) {
  position: absolute;
  width: 1px;
  height: 1px !important;
  padding: 0 !important;
  overflow: hidden;
  clip-path: inset(50%);
}
.search-field :deep(.el-form-item__content) {
  width: 100%;
}
.search-field :deep(.el-input__wrapper) {
  min-height: 38px;
  border-radius: 20px;
  background: #f6f8f2;
}
.search-field :deep(.el-input__inner) {
  height: 36px;
  font-size: 12px;
}
.search-field :deep(.el-form-item__error) {
  padding-left: 10px;
}
.search-submit {
  height: 38px;
  padding: 0 15px;
  border-radius: 20px;
  color: var(--ink);
  background: #f4f7f0;
  border-color: var(--line);
}
.mobile-search-toggle {
  display: none;
}
.library-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-left: auto;
}
.sort-control {
  width: 145px;
}
.sort-control :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px var(--line) inset;
  border-radius: 6px;
}
.size-control {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-muted);
  font-size: 12px;
}
.size-control :deep(.el-input-number) {
  width: 64px;
}
.size-control :deep(.el-input__wrapper) {
  min-height: 32px;
  border-radius: 6px;
  padding: 0 8px;
}
.size-control :deep(.el-input__inner) {
  height: 30px;
}
.search-cooldown {
  width: 100%;
  text-align: right;
  font-size: 12px;
  color: var(--ink-muted);
}
.search-symbol {
  display: block;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  position: relative;
}
.search-symbol::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 1.5px;
  background: var(--ink);
  right: -5px;
  bottom: -2px;
  transform: rotate(45deg);
}
@media (max-width: 720px) {
  .mobile-search-toggle {
    display: inline-flex;
    width: 34px;
    height: 34px;
    padding: 8px;
    margin: 0;
  }
  .library-search {
    display: none;
  }
  .is-open .library-search {
    display: flex;
    position: absolute;
    top: 69px;
    left: 14px;
    right: 14px;
    width: auto;
  }
  .library-controls {
    width: 100%;
    justify-content: space-between;
    gap: 10px;
  }
  .sort-control {
    width: 145px;
  }
  .size-control {
    gap: 5px;
  }
  .size-control :deep(.el-input-number) {
    width: 52px;
  }
}
</style>
