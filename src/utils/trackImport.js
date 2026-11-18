const warningMessages = {
  TITLE_FALLBACK: '标签缺少标题，使用去除扩展名后的文件名。',
  ARTIST_FALLBACK: '标签缺少艺术家，使用 Unknown Artist。',
  COVER_MISSING: '未找到内嵌封面。',
  COVER_TOO_LARGE: '内嵌封面超过 20 MiB，使用缺省封面。',
  TITLE_TRUNCATED: '标题超过 255 个字符，已截断。',
  ARTIST_TRUNCATED: '艺术家名称超过 255 个字符，已截断。',
  ALBUM_TRUNCATED: '专辑名称超过 255 个字符，已截断。',
  TRACK_NUMBER_INVALID: '曲序不是正整数，请核对歌曲信息。',
  DISC_NUMBER_INVALID: '碟片序号不是正整数，请核对歌曲信息。',
}

export function validateImportFile(file) {
  if (!(file instanceof File)) return '请选择有效的音频文件。'
  if (!/\.(mp3|flac)$/i.test(file.name)) return '仅支持 MP3 或 FLAC 文件。'
  if (file.size > 209715200) return '每个文件最大 200 MiB。'
  return null
}

export function formatImportFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

export function normalizeImportWarnings(value) {
  if (!Array.isArray(value) || value.some((code) => typeof code !== 'string'))
    return ['导入提示信息读取异常，请核对歌曲信息。']
  return [
    ...new Set(
      value.map((code) =>
        Object.hasOwn(warningMessages, code)
          ? warningMessages[code]
          : '另有导入提示，请核对歌曲信息。',
      ),
    ),
  ]
}

export function getImportProgress(event) {
  const { loaded, total } = event
  if (
    !Number.isFinite(loaded) ||
    loaded < 0 ||
    !Number.isFinite(total) ||
    total <= 0
  )
    return { percent: null, sent: false }
  const sent = loaded >= total
  return {
    percent: sent ? 100 : Math.min(99, Math.round((loaded / total) * 100)),
    sent,
  }
}
