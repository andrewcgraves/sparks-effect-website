import { mount } from '@vue/test-utils'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import ToastRegion from '../components/ToastRegion.vue'
import { useConfirmHost } from '../composables/useConfirm'
import { useToastHost } from '../composables/useToast'

// App.vue renders the confirm dialog and toast region once for every page; a
// spec that mounts a caller on its own mounts them alongside it.
export function mountSharedHosts() {
  const dialogHost = mount(ConfirmDialog, { attachTo: document.body })
  const toastHost = mount(ToastRegion, { attachTo: document.body })

  return {
    dialog: () => dialogHost.get('[data-testid="confirm-dialog"]'),
    dialogOpen: () => (dialogHost.get('[data-testid="confirm-dialog"]').element as HTMLDialogElement).open,
    confirmButton: () => dialogHost.get('[data-testid="confirm-dialog-confirm"]'),
    cancelButton: () => dialogHost.get('[data-testid="confirm-dialog-cancel"]'),
    toasts: () => toastHost.findAll('[data-testid="toast-message"]').map((m) => m.text()),
    unmount: () => {
      useConfirmHost().settle(false)
      useToastHost().clear()
      dialogHost.unmount()
      toastHost.unmount()
    },
  }
}
