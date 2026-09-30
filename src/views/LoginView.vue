<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../api/authoring'
import { SESSION_EXPIRED_FAULT } from '../api/authoringFault'
import { PRIMARY_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// The expiry notice explains this one visit; a later, unrelated visit to sign
// in should not still be told its session expired.
onBeforeUnmount(() => { auth.sessionExpired = false })

// The ?redirect= destination, if it is a path on this site. Anything else — an
// absolute or protocol-relative URL, or a path a browser would read as one
// (`/\\host`) — is dropped, so a crafted sign-in link cannot send the user
// off-site once they have authenticated.
function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  try {
    const resolved = new URL(value, window.location.origin)
    return resolved.origin === window.location.origin ? value : null
  } catch {
    return null
  }
}

async function handleSubmit() {
  if (!email.value || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    await router.push(safeRedirect(route.query.redirect) ?? '/authoring')
  } catch (err: unknown) {
    // The API returns a generic 401 for any bad credential (unknown email,
    // wrong password, no password set) to avoid account enumeration.
    error.value = err instanceof ApiError && err.status === 401
      ? 'Invalid email or password.'
      : 'Something went wrong signing in. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <div class="mx-auto flex max-w-[360px] flex-col gap-2">
      <h1 class="font-display text-display text-ink-true">
        Sign in
      </h1>
      <p class="font-body text-micro text-ink-muted italic uppercase">
        Invite-only · accounts are provisioned by an admin
      </p>

      <p
        v-if="auth.sessionExpired"
        class="font-body text-caption text-coral mt-4"
        role="status"
        data-testid="session-expired"
      >
        {{ SESSION_EXPIRED_FAULT }}
      </p>

      <form
        class="mt-6 flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4"
        @submit.prevent="handleSubmit"
      >
        <label :class="FIELD_LABEL_CLASS">
          Email
          <input
            v-model="email"
            :class="FIELD_INPUT_CLASS"
            data-testid="email"
            type="email"
            autocomplete="username"
          >
        </label>
        <label :class="FIELD_LABEL_CLASS">
          Password
          <input
            v-model="password"
            :class="FIELD_INPUT_CLASS"
            data-testid="password"
            type="password"
            autocomplete="current-password"
          >
        </label>

        <button
          type="submit"
          :class="[PRIMARY_BUTTON_CLASS, 'mt-1']"
          data-testid="submit"
          :disabled="!email || !password || loading"
        >
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>

        <p
          v-if="error"
          class="font-body text-caption text-coral"
          role="alert"
          data-testid="login-error"
        >
          {{ error }}
        </p>
      </form>
    </div>
  </main>
</template>
