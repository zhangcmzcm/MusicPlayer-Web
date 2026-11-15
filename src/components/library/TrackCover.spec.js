import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { getTrackCover } from '../../api/tracks.js'
import { useAuthStore } from '../../stores/auth.js'
import { authentication, deferred } from '../../test/factories.js'
import { ApiError } from '../../utils/errors.js'
import TrackCover from './TrackCover.vue'

vi.mock('../../api/tracks.js', () => ({ getTrackCover: vi.fn() }))
const NativeURL = URL
const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()
const image = () => new Blob(['cover'], { type: 'image/png' })
function cover(props = {}) {
  return mount(TrackCover, {
    props: { trackId: '42', enabled: true, alt: '歌曲封面', ...props },
  })
}
beforeEach(() => {
  setActivePinia(createPinia())
  useAuthStore().session = authentication()
  getTrackCover.mockReset().mockResolvedValue(image())
  createObjectURL
    .mockReset()
    .mockImplementation(() => `blob:cover-${createObjectURL.mock.calls.length}`)
  revokeObjectURL.mockReset()
  class ResourceURL extends NativeURL {}
  ResourceURL.createObjectURL = createObjectURL
  ResourceURL.revokeObjectURL = revokeObjectURL
  vi.stubGlobal('URL', ResourceURL)
})
afterEach(() => vi.unstubAllGlobals())

describe('cover resources', () => {
  it('should_load_authorized_cover_and_revoke_on_unmount', async () => {
    const wrapper = cover()
    await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBe('blob:cover-1')
    expect(getTrackCover).toHaveBeenCalledWith('42', {
      signal: expect.any(AbortSignal),
    })
    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1')
  })
  it('should_use_a_placeholder_for_null_cover_without_requesting', async () => {
    const wrapper = cover({ enabled: false })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(
      wrapper.get('[data-testid="track-cover-placeholder"]').exists(),
    ).toBe(true)
    expect(getTrackCover).not.toHaveBeenCalled()
  })
  it('should_cancel_and_ignore_late_cover_after_disable', async () => {
    const gate = deferred()
    getTrackCover.mockReturnValue(gate.promise)
    const wrapper = cover()
    const signal = getTrackCover.mock.calls[0][1].signal
    await wrapper.setProps({ enabled: false })
    gate.resolve(image())
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.find('img').exists()).toBe(false)
  })
  it('should_release_old_urls_when_switching_tracks', async () => {
    const wrapper = cover()
    await flushPromises()
    await wrapper.setProps({ trackId: '43' })
    await flushPromises()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1')
    expect(wrapper.get('img').attributes('src')).toBe('blob:cover-2')
  })
  it('should_reload_for_a_new_session_and_ignore_the_old_blob', async () => {
    const gate = deferred()
    getTrackCover
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValueOnce(image())
    const wrapper = cover()
    useAuthStore().clearSession()
    useAuthStore().session = authentication('ADMIN')
    await flushPromises()
    gate.resolve(image())
    await flushPromises()
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(wrapper.get('img').attributes('src')).toBe('blob:cover-1')
  })
  it.each([
    'COVER_NOT_FOUND',
    'NETWORK_ERROR',
    'MEDIA_STORAGE_UNAVAILABLE',
    'CANCELLED',
  ])('should_fall_back_after_%s', async (code) => {
    getTrackCover.mockRejectedValue(new ApiError({ code }))
    const wrapper = cover()
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(
      wrapper.get('[data-testid="track-cover-placeholder"]').exists(),
    ).toBe(true)
  })
  it('should_revoke_the_url_when_the_image_fails_to_decode', async () => {
    const wrapper = cover()
    await flushPromises()
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover-1')
    expect(getTrackCover).toHaveBeenCalledTimes(1)
  })
  it('should_fall_back_if_an_object_url_cannot_be_created', async () => {
    createObjectURL.mockImplementation(() => {
      throw Error('unsupported resource')
    })
    const wrapper = cover()
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
