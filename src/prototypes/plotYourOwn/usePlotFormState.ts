// PROTOTYPE (throwaway): shared state for the "Plot your own" layout variants.
// Mirrors IsochroneForm.vue's behaviour so the variants differ only in layout.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import type { GeocodingSuggestion } from '../../api/geocoding'
import { reverseGeocode } from '../../api/geocoding'
import { getCurrentPosition } from '../../api/geolocation'
import { trackModeToggle } from '../../analytics/index'
import type { TravelMode } from '../../api/authoring/types'
import { DEFAULT_DURATION, DEFAULT_MODE, DURATION_OPTIONS, type IsochronePayload } from '../../isochroneQuery'

export interface PlotFormProps {
  error?: string | null
  loading?: boolean
  offline?: boolean
  initial?: Partial<IsochronePayload>
  framed?: boolean
}

export interface PlotFormEmit {
  (e: 'submit', payload: IsochronePayload): void
  (e: 'origin-change', origin: { lat: number; lng: number } | null): void
  (e: 'pick-armed', armed: boolean): void
}

export type OriginSource = 'address' | 'location' | 'pin' | 'coords' | 'link' | null

export function usePlotFormState(props: PlotFormProps, emit: PlotFormEmit) {
  const initial = props.initial ?? {}
  const lat = ref(initial.lat === undefined ? '' : String(initial.lat))
  const lng = ref(initial.lng === undefined ? '' : String(initial.lng))
  const duration = ref(initial.duration ?? DEFAULT_DURATION)
  const mode = ref<TravelMode>(initial.mode ?? DEFAULT_MODE)
  const locationError = ref('')
  const locating = ref(false)
  const pickArmed = ref(false)
  const autocomplete = ref<InstanceType<typeof AddressAutocomplete> | null>(null)
  const originSource = ref<OriginSource>(initial.lat !== undefined ? 'link' : null)
  const originLabel = ref('')
  let locationRequestId = 0

  const origin = computed(() => {
    const a = parseFloat(lat.value)
    const b = parseFloat(lng.value)
    return isFinite(a) && isFinite(b) ? { lat: a, lng: b } : null
  })
  const isValid = computed(() => origin.value !== null)
  const coordsText = computed(() =>
    origin.value ? `${origin.value.lat.toFixed(4)}, ${origin.value.lng.toFixed(4)}` : '',
  )

  const errorDismissed = ref(false)
  watch(() => props.error, () => { errorDismissed.value = false })
  watch([lat, lng, duration, mode], () => { errorDismissed.value = true })
  const showError = computed(() => !!props.error && !errorDismissed.value)

  watch(origin, (o) => emit('origin-change', o))
  watch(pickArmed, (armed) => emit('pick-armed', armed))
  watch([lat, lng], () => { pickArmed.value = false })

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') pickArmed.value = false
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    if (pickArmed.value) emit('pick-armed', false)
  })

  function setOrigin(coord: { lat: number; lng: number }, source: OriginSource, label = '') {
    pickArmed.value = false
    lat.value = String(coord.lat)
    lng.value = String(coord.lng)
    originSource.value = source
    originLabel.value = label
  }

  function setOriginFromMap(coord: { lat: number; lng: number }) {
    if (!pickArmed.value) return
    setOrigin(coord, 'pin')
    autocomplete.value?.setInputValue('')
    // Name the dropped pin when the geocoder can; the coordinates stand in until then.
    void reverseGeocode(coord.lat, coord.lng)
      .then((s) => {
        if (s && originSource.value === 'pin' && lat.value === String(coord.lat)) originLabel.value = s.label
      })
      .catch(() => {})
  }

  function clearOrigin() {
    lat.value = ''
    lng.value = ''
    originSource.value = null
    originLabel.value = ''
    autocomplete.value?.setInputValue('')
  }

  const extraDuration = ref<number | null>(null)
  const durationOptions = computed(() =>
    extraDuration.value === null
      ? DURATION_OPTIONS
      : [...DURATION_OPTIONS, extraDuration.value].sort((a, b) => a - b),
  )

  function fill(payload: IsochronePayload) {
    extraDuration.value = DURATION_OPTIONS.includes(payload.duration) ? null : payload.duration
    setOrigin(payload, 'link')
    duration.value = payload.duration
    mode.value = payload.mode
    autocomplete.value?.setInputValue('')
  }

  function onAddressSelect(suggestion: GeocodingSuggestion) {
    setOrigin(suggestion, 'address', suggestion.label)
  }

  async function useMyLocation() {
    if (locating.value) return
    pickArmed.value = false
    locating.value = true
    locationError.value = ''
    const requestId = ++locationRequestId
    try {
      const position = await getCurrentPosition()
      if (requestId !== locationRequestId) return
      setOrigin(position, 'location')
      const suggestion = await reverseGeocode(position.lat, position.lng)
      if (requestId !== locationRequestId) return
      originLabel.value = suggestion?.label ?? ''
      autocomplete.value?.setInputValue(suggestion?.label ?? '')
    } catch {
      if (requestId !== locationRequestId) return
      locationError.value = 'Unable to get your current location.'
    } finally {
      if (requestId === locationRequestId) locating.value = false
    }
  }

  function setMode(newMode: TravelMode) {
    mode.value = newMode
    trackModeToggle(newMode)
  }

  function submit() {
    if (!origin.value || props.offline) return
    emit('submit', { ...origin.value, duration: duration.value, mode: mode.value })
  }

  const ORIGIN_SOURCE_TEXT: Record<Exclude<OriginSource, null>, string> = {
    address: 'Address',
    location: 'Your location',
    pin: 'Dropped pin',
    coords: 'Coordinates',
    link: 'Starting point',
  }
  const originTitle = computed(() =>
    originLabel.value || (originSource.value ? ORIGIN_SOURCE_TEXT[originSource.value] : ''),
  )

  return {
    lat, lng, duration, mode, durationOptions,
    locating, locationError, pickArmed, autocomplete,
    origin, isValid, coordsText, originSource, originTitle,
    showError,
    setOrigin, setOriginFromMap, clearOrigin, fill, onAddressSelect, useMyLocation, setMode, submit,
  }
}
