<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { accountFault } from '../api/accountFault'
import { isSessionExpiry } from '../api/authoring'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { DESTRUCTIVE_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import { AUTHORING_CRUMB } from '../components/crumbs'

const MIN_PASSWORD_LENGTH = 12

const auth = useAuthStore()
const router = useRouter()
const { confirm } = useConfirm()
const { show: toast } = useToast()

const SECTION_CLASS = 'flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4'
const ERROR_CLASS = 'font-body text-caption text-error'

const signedInAs = computed(() => auth.user?.name || auth.user?.email || '…')

// The user record can land after the page does (restoreSession runs on boot),
// so the field follows it until the user saves something of their own.
const name = ref(auth.user?.name ?? '')
watch(() => auth.user?.name, (saved) => { name.value = saved ?? '' })
const savingName = ref(false)
const profileError = ref('')
const nameChanged = computed(() => {
  const trimmed = name.value.trim()
  return trimmed !== '' && trimmed !== (auth.user?.name ?? '')
})

async function saveName(): Promise<void> {
  if (!nameChanged.value || savingName.value) return
  savingName.value = true
  profileError.value = ''
  try {
    await auth.updateName(name.value.trim())
    toast('Name saved')
  } catch (err: unknown) {
    // An expired session has already sent the user to sign in.
    if (!isSessionExpiry(err)) profileError.value = accountFault(err)
  } finally {
    savingName.value = false
  }
}

const currentPassword = ref('')
const newPassword = ref('')
const changingPassword = ref(false)
const passwordError = ref('')
const passwordChanged = ref(false)

async function changePassword(): Promise<void> {
  if (!currentPassword.value || !newPassword.value || changingPassword.value) return
  changingPassword.value = true
  passwordError.value = ''
  passwordChanged.value = false
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    passwordChanged.value = true
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) passwordError.value = accountFault(err)
  } finally {
    changingPassword.value = false
  }
}

const sessionsError = ref('')
const signingOutEverywhere = ref(false)

async function signOut(): Promise<void> {
  await auth.logout()
  await router.push('/login')
}

async function signOutEverywhere(): Promise<void> {
  const confirmed = await confirm({
    title: 'Sign out everywhere?',
    body: "This signs you out on every device, this one included. You'll need to sign in again.",
    confirmLabel: 'Sign out everywhere',
    destructive: true,
  })
  if (!confirmed) return
  signingOutEverywhere.value = true
  sessionsError.value = ''
  try {
    await auth.logoutEverywhere()
    await router.push('/login')
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) sessionsError.value = accountFault(err)
  } finally {
    signingOutEverywhere.value = false
  }
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="[AUTHORING_CRUMB, { label: 'Account' }]" />
    <div class="mx-auto mt-8 flex max-w-[480px] flex-col gap-8">
      <hgroup class="flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          Account
        </h1>
        <p
          class="font-body text-micro text-ink-muted italic uppercase"
          data-testid="signed-in-as"
        >
          Signed in as {{ signedInAs }}
        </p>
      </hgroup>

      <section
        aria-labelledby="account-profile-heading"
        data-testid="profile"
      >
        <h2
          id="account-profile-heading"
          class="font-display text-h2 text-ink-true"
        >
          Profile
        </h2>
        <form
          :class="[SECTION_CLASS, 'mt-3']"
          data-testid="profile-form"
          @submit.prevent="saveName"
        >
          <label :class="FIELD_LABEL_CLASS">
            Display name
            <input
              v-model="name"
              :class="FIELD_INPUT_CLASS"
              data-testid="name"
              type="text"
              autocomplete="name"
              maxlength="80"
              aria-describedby="account-name-hint"
            >
          </label>
          <p
            id="account-name-hint"
            class="font-body text-caption text-ink-muted"
          >
            Appears on your published pages, where anyone can see it.
          </p>
          <button
            type="submit"
            :class="[PRIMARY_BUTTON_CLASS, 'self-start']"
            data-testid="save-name"
            :disabled="!nameChanged || savingName"
          >
            {{ savingName ? 'Saving…' : 'Save name' }}
          </button>
          <p
            v-if="profileError"
            :class="ERROR_CLASS"
            role="alert"
            data-testid="profile-error"
          >
            {{ profileError }}
          </p>
        </form>
      </section>

      <section aria-labelledby="account-password-heading">
        <h2
          id="account-password-heading"
          class="font-display text-h2 text-ink-true"
        >
          Password
        </h2>
        <form
          :class="[SECTION_CLASS, 'mt-3']"
          data-testid="password-form"
          @submit.prevent="changePassword"
        >
          <!-- Lets a password manager tell which account the new password is for. -->
          <input
            type="text"
            autocomplete="username"
            :value="auth.user?.email ?? ''"
            class="hidden"
            readonly
            tabindex="-1"
            aria-hidden="true"
          >
          <label :class="FIELD_LABEL_CLASS">
            Current password
            <input
              v-model="currentPassword"
              :class="FIELD_INPUT_CLASS"
              data-testid="current-password"
              type="password"
              autocomplete="current-password"
            >
          </label>
          <label :class="FIELD_LABEL_CLASS">
            New password
            <input
              v-model="newPassword"
              :class="FIELD_INPUT_CLASS"
              data-testid="new-password"
              type="password"
              autocomplete="new-password"
              :minlength="MIN_PASSWORD_LENGTH"
              aria-describedby="account-password-policy"
            >
          </label>
          <p
            id="account-password-policy"
            class="font-body text-caption text-ink-muted"
            data-testid="password-policy"
          >
            Use at least {{ MIN_PASSWORD_LENGTH }} characters. Changing it signs you out on your other devices.
          </p>
          <button
            type="submit"
            :class="[PRIMARY_BUTTON_CLASS, 'self-start']"
            data-testid="change-password"
            :disabled="!currentPassword || !newPassword || changingPassword"
          >
            {{ changingPassword ? 'Changing…' : 'Change password' }}
          </button>
          <p
            v-if="passwordError"
            :class="ERROR_CLASS"
            role="alert"
            data-testid="password-error"
          >
            {{ passwordError }}
          </p>
          <p
            v-if="passwordChanged"
            class="font-body text-caption text-ink"
            role="status"
            data-testid="password-changed"
          >
            Password changed. Your other devices were signed out; this one stays signed in.
          </p>
        </form>
      </section>

      <section aria-labelledby="account-sessions-heading">
        <h2
          id="account-sessions-heading"
          class="font-display text-h2 text-ink-true"
        >
          Sessions
        </h2>
        <div :class="[SECTION_CLASS, 'mt-3']">
          <p class="font-body text-caption text-ink-muted">
            Signing out everywhere ends every session you have, on every device, this one included.
          </p>
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              :class="SECONDARY_BUTTON_CLASS"
              data-testid="sign-out"
              @click="signOut"
            >
              Sign out
            </button>
            <button
              type="button"
              :class="DESTRUCTIVE_BUTTON_CLASS"
              data-testid="sign-out-everywhere"
              :disabled="signingOutEverywhere"
              @click="signOutEverywhere"
            >
              Sign out everywhere
            </button>
          </div>
          <p
            v-if="sessionsError"
            :class="ERROR_CLASS"
            role="alert"
            data-testid="sessions-error"
          >
            {{ sessionsError }}
          </p>
        </div>
      </section>
    </div>
  </main>
</template>
