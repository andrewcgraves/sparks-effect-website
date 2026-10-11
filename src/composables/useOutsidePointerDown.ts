import { onBeforeUnmount, watch, type Ref } from 'vue'

export function useOutsidePointerDown(
  root: Ref<HTMLElement | null>,
  open: Ref<boolean>,
  onOutside: () => void,
): void {
  function onPointerDown(event: PointerEvent): void {
    if (!root.value?.contains(event.target as Node | null)) onOutside()
  }

  // Listened for only while open, so a closed menu costs every click nothing.
  watch(open, (isOpen) => {
    if (isOpen) document.addEventListener('pointerdown', onPointerDown, true)
    else document.removeEventListener('pointerdown', onPointerDown, true)
  })

  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))
}
