import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import VehicleFields from './VehicleFields.vue'
import type { VehicleParams } from '../api/authoring/types'

const custom: VehicleParams = { max_speed_kmh: 320, acceleration_ms2: 1, deceleration_ms2: 1, dwell_s: 30 }
const regionalRail: VehicleParams = { max_speed_kmh: 177, acceleration_ms2: 0.6, deceleration_ms2: 0.7, dwell_s: 45 }

// Mounted the way a parent uses it: every update is written straight back into
// the prop, so a test reads what the author would see after the change.
function mountFields(vehicle: VehicleParams) {
  const wrapper = mount(VehicleFields, {
    props: {
      modelValue: vehicle,
      'onUpdate:modelValue': (next: VehicleParams) => wrapper.setProps({ modelValue: next }),
    },
  })
  return wrapper
}

function fieldValue(wrapper: ReturnType<typeof mountFields>, testId: string): string {
  return (wrapper.get(`[data-testid="${testId}"]`).element as HTMLInputElement).value
}

function presetChecked(wrapper: ReturnType<typeof mountFields>, id: string): boolean {
  return (wrapper.get(`[data-testid="vehicle-preset-option-${id}"]`).element as HTMLInputElement).checked
}

describe('VehicleFields', () => {
  describe('presets', () => {
    it('offers the four vehicle types and Custom above the fields, with Custom chosen for values that match no preset', () => {
      const wrapper = mountFields(custom)

      const control = wrapper.get('[data-testid="vehicle-preset"]')
      expect(control.findAll('label').map((label) => label.text())).toEqual([
        'High-speed rail',
        'Regional rail',
        'Light rail',
        'BRT / bus',
        'Custom',
      ])
      expect(presetChecked(wrapper, 'custom')).toBe(true)
      for (const id of ['high_speed_rail', 'regional_rail', 'light_rail', 'brt_bus']) {
        expect(presetChecked(wrapper, id)).toBe(false)
      }
    })

    it('leaves the values alone when Custom itself is chosen, and shows Custom until a preset is picked', async () => {
      const wrapper = mountFields(regionalRail)

      await wrapper.get('[data-testid="vehicle-preset-option-custom"]').setValue(true)

      expect(wrapper.props('modelValue')).toEqual(regionalRail)
      expect(presetChecked(wrapper, 'custom')).toBe(true)
      expect(presetChecked(wrapper, 'regional_rail')).toBe(false)

      await wrapper.get('[data-testid="vehicle-preset-option-regional_rail"]').setValue(true)

      expect(presetChecked(wrapper, 'regional_rail')).toBe(true)
      expect(presetChecked(wrapper, 'custom')).toBe(false)
    })

    it('fills all four fields when a preset is chosen', async () => {
      const wrapper = mountFields(custom)

      await wrapper.get('[data-testid="vehicle-preset-option-light_rail"]').setValue(true)

      expect(wrapper.props('modelValue')).toEqual({
        max_speed_kmh: 90,
        acceleration_ms2: 1.0,
        deceleration_ms2: 1.2,
        dwell_s: 25,
      })
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('90')
      expect(fieldValue(wrapper, 'vehicle-acceleration')).toBe('1')
      expect(fieldValue(wrapper, 'vehicle-deceleration')).toBe('1.2')
      expect(fieldValue(wrapper, 'vehicle-dwell')).toBe('25')
      expect(presetChecked(wrapper, 'light_rail')).toBe(true)
      expect(presetChecked(wrapper, 'custom')).toBe(false)
    })

    it('recognises a vehicle whose values equal a preset, as a saved service arrives', () => {
      const wrapper = mountFields(regionalRail)

      expect(presetChecked(wrapper, 'regional_rail')).toBe(true)
      expect(presetChecked(wrapper, 'custom')).toBe(false)
    })

    it('reads Custom as soon as any field is edited away from the preset', async () => {
      const wrapper = mountFields(regionalRail)

      await wrapper.get('[data-testid="vehicle-dwell"]').setValue(50)

      expect(presetChecked(wrapper, 'custom')).toBe(true)
      expect(presetChecked(wrapper, 'regional_rail')).toBe(false)
      expect(wrapper.props('modelValue')).toEqual({ ...regionalRail, dwell_s: 50 })
    })
  })

  describe('guidance', () => {
    it('explains each field in one line', () => {
      const wrapper = mountFields(custom)

      expect(wrapper.get('[data-testid="vehicle-max-speed-help"]').text()).toBe(
        'Top speed between stops; a bus runs about 80 km/h, high-speed rail 300 km/h or more',
      )
      expect(wrapper.get('[data-testid="vehicle-acceleration-help"]').text()).toBe(
        'How quickly it speeds up; 0.3–1.2 m/s² is typical for passenger rail',
      )
      expect(wrapper.get('[data-testid="vehicle-deceleration-help"]').text()).toBe(
        'How quickly it slows for a stop; 0.4–1.3 m/s² is typical for passenger rail',
      )
      expect(wrapper.get('[data-testid="vehicle-dwell-help"]').text()).toBe(
        'Time stopped at each station for boarding; 20–90 s is typical',
      )
    })

    it('warns inline about an out-of-range value, and says nothing about one in range', async () => {
      const wrapper = mountFields(regionalRail)
      expect(wrapper.find('[data-testid="vehicle-acceleration-warning"]').exists()).toBe(false)

      await wrapper.get('[data-testid="vehicle-acceleration"]').setValue(2)

      const warning = wrapper.get('[data-testid="vehicle-acceleration-warning"]')
      expect(warning.text()).toBe('Higher than most passenger rail')
      expect(warning.attributes('role')).toBe('status')
      expect(wrapper.find('[data-testid="vehicle-deceleration-warning"]').exists()).toBe(false)
    })

    it('does not block the value: the warning sits beside what was typed', async () => {
      const wrapper = mountFields(regionalRail)

      await wrapper.get('[data-testid="vehicle-max-speed"]').setValue(500)

      expect(wrapper.props('modelValue').max_speed_kmh).toBe(500)
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('500')
      expect(wrapper.get('[data-testid="vehicle-max-speed-warning"]').text()).toBe('Faster than any passenger rail in service')
    })
  })

  describe('speed unit', () => {
    it('shows km/h by default', () => {
      const wrapper = mountFields(custom)

      expect(wrapper.get('[data-testid="vehicle-max-speed-label"]').text()).toBe('Max speed (km/h)')
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('320')
    })

    it('shows the same speed in mph when toggled, without changing the stored value', async () => {
      const wrapper = mountFields(custom)

      await wrapper.get('[data-testid="vehicle-speed-unit-option-mph"]').setValue(true)

      expect(wrapper.get('[data-testid="vehicle-max-speed-label"]').text()).toBe('Max speed (mph)')
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('198.8')
      expect(wrapper.props('modelValue').max_speed_kmh).toBe(320)
      expect(wrapper.get('[data-testid="vehicle-max-speed-help"]').text()).toContain('50 mph')
    })

    it('stores a speed typed in mph as km/h', async () => {
      const wrapper = mountFields(custom)
      await wrapper.get('[data-testid="vehicle-speed-unit-option-mph"]').setValue(true)

      await wrapper.get('[data-testid="vehicle-max-speed"]').setValue(110)

      expect(wrapper.props('modelValue').max_speed_kmh).toBe(177)
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('110')
    })

    it('still matches a preset through the mph display', async () => {
      const wrapper = mountFields(custom)
      await wrapper.get('[data-testid="vehicle-speed-unit-option-mph"]').setValue(true)

      await wrapper.get('[data-testid="vehicle-preset-option-regional_rail"]').setValue(true)

      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('110')
      expect(presetChecked(wrapper, 'regional_rail')).toBe(true)
      expect(wrapper.props('modelValue').max_speed_kmh).toBe(177)
    })

    it('comes back to km/h when toggled again', async () => {
      const wrapper = mountFields(custom)
      await wrapper.get('[data-testid="vehicle-speed-unit-option-mph"]').setValue(true)

      await wrapper.get('[data-testid="vehicle-speed-unit-option-kmh"]').setValue(true)

      expect(wrapper.get('[data-testid="vehicle-max-speed-label"]').text()).toBe('Max speed (km/h)')
      expect(fieldValue(wrapper, 'vehicle-max-speed')).toBe('320')
    })
  })
})
