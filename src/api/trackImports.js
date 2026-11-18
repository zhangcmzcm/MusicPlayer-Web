import { http } from './http.js'
import { invalidResponse, longString, parseTrackJson } from './trackResponse.js'
import {
  getImportProgress,
  normalizeImportWarnings,
} from '../utils/trackImport.js'

export async function importTrack(
  { file, uploadId },
  { signal, onProgress } = {},
) {
  const data = new FormData()
  data.append('uploadId', uploadId)
  data.append('file', file)
  const response = await http.post('/track-imports', data, {
    signal,
    timeout: 600000,
    responseType: 'text',
    transformResponse: [parseTrackJson],
    onUploadProgress: (event) => onProgress?.(getImportProgress(event)),
  })
  const result = response.data
  if (
    ![200, 201].includes(response.status) ||
    result?.status !== 'READY' ||
    result.uploadId !== uploadId
  )
    throw invalidResponse()
  const id = longString(result.track?.id, 1n)
  let importId
  try {
    importId = longString(result.importId, 1n)
  } catch {
    importId = null
  }
  return {
    uploadId: result.uploadId,
    status: 'READY',
    importId,
    track: {
      id,
      title:
        typeof result.track.title === 'string' && result.track.title.length
          ? result.track.title
          : '未命名歌曲',
      artistName:
        typeof result.track.artistName === 'string' &&
        result.track.artistName.length
          ? result.track.artistName
          : '未知艺术家',
    },
    warnings: normalizeImportWarnings(result.metadataWarnings),
  }
}
