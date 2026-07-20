<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../api/authoring'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function handleSubmit() {
  if (!email.value || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/authoring'
    await router.push(redirect)
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
          class="font-display text-btn mt-1 cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-coral"
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
