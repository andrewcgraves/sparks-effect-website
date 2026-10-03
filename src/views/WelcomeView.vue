<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError, fetchAccountToken, fetchCurrentUser, redeemAccountToken, type AccountToken } from '../api/authoring'
import { retryAfterSentence } from '../api/authoringFault'
import { usePageTitle } from '../composables/usePageTitle'
import { PRIMARY_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const props = defineProps<{ token: string }>()

const EXPIRED_COPY = 'This link has expired or has already been used. Ask an admin for a new one.'
const POLICY_COPY = 'At least 12 characters. Not your email address, and not a common password.'

const RULE_SENTENCES: Record<string, string> = {
  required: 'Choose a password.',
  min_length: 'Use at least 12 characters.',
  // The cap is 72 bytes, not characters, so a count would mislead.
  max_length: 'That password is too long. Choose a shorter one.',
  matches_email: "Your password can't be your email address.",
  common: 'That password is too common. Choose something harder to guess.',
}

const link = ref<AccountToken | null>(null)
const state = ref<'loading' | 'ready' | 'expired' | 'unavailable'>('loading')
const password = ref('')
const confirm = ref('')
const error = ref('')
const saving = ref(false)

const auth = useAuthStore()
const router = useRouter()

const heading = computed(() => {
  if (link.value?.purpose === 'invite') return 'Welcome to Sparks Effect'
  if (link.value?.purpose === 'reset') return 'Choose a new password'
  return 'Set your password'
})

usePageTitle(() => (link.value ? heading.value : null))

function sameEmail(a: string | undefined, b: string): boolean {
  return a?.trim().toLowerCase() === b.trim().toLowerCase()
}

// A signed-in user opening someone else's link — an admin checking the invite
// they just made, say — is sent to their own authoring, as /login does, rather
// than handed a form that would spend the link and sign them in as its owner.
async function signedInAsSomeoneElse(email: string): Promise<boolean> {
  if (!auth.isAuthenticated) return false
  const me = auth.user ?? await fetchCurrentUser().catch(() => null)
  // A 401 just now has signed the dead session out, so the form is safe to show.
  if (!auth.isAuthenticated) return false
  // Unsure whose session this is, so fail closed rather than risk the link.
  return !sameEmail(me?.email, email)
}

onMounted(async () => {
  try {
    const found = await fetchAccountToken(props.token)
    if (await signedInAsSomeoneElse(found.email)) {
      await router.replace('/authoring')
      return
    }
    link.value = found
    state.value = 'ready'
  } catch (err: unknown) {
    state.value = err instanceof ApiError && err.status === 404 ? 'expired' : 'unavailable'
  }
})

function policySentence(err: ApiError): string {
  const faults = (err.detail as { faults?: { rule?: unknown }[] } | null)?.faults
  const rule = Array.isArray(faults) ? faults[0]?.rule : undefined
  return (typeof rule === 'string' ? RULE_SENTENCES[rule] : undefined) ?? POLICY_COPY
}

async function handleSubmit() {
  if (!password.value || !confirm.value || saving.value) return
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = "The passwords don't match."
    return
  }
  saving.value = true
  try {
    const session = await redeemAccountToken(props.token, password.value)
    auth.signIn(session.token, session.user)
    await router.push('/authoring')
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 404) {
      state.value = 'expired'
    } else if (err instanceof ApiError && err.status === 422) {
      error.value = policySentence(err)
    } else if (err instanceof ApiError && err.status === 429) {
      error.value = retryAfterSentence(err.retryAfterS)
    } else {
      error.value = 'Something went wrong setting your password. Try again.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <div class="mx-auto flex max-w-[360px] flex-col gap-2">
      <h1 class="font-display text-display text-ink-true">
        {{ heading }}
      </h1>

      <p
        v-if="state === 'loading'"
        class="font-body text-caption text-ink-muted mt-4"
        role="status"
      >
        Checking your link…
      </p>

      <p
        v-else-if="state === 'expired'"
        class="font-body text-caption text-error mt-4"
        role="alert"
        data-testid="link-expired"
      >
        {{ EXPIRED_COPY }}
      </p>

      <p
        v-else-if="state === 'unavailable'"
        class="font-body text-caption text-error mt-4"
        role="alert"
        data-testid="load-error"
      >
        Couldn't check your link. Reload the page to try again.
      </p>

      <form
        v-else-if="link"
        class="mt-6 flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4"
        @submit.prevent="handleSubmit"
      >
        <label :class="FIELD_LABEL_CLASS">
          Email
          <input
            :value="link.email"
            :class="FIELD_INPUT_CLASS"
            data-testid="email"
            type="email"
            autocomplete="username"
            readonly
          >
        </label>
        <label :class="FIELD_LABEL_CLASS">
          New password
          <input
            v-model="password"
            :class="FIELD_INPUT_CLASS"
            data-testid="new-password"
            type="password"
            autocomplete="new-password"
            aria-describedby="password-policy"
          >
        </label>
        <p
          id="password-policy"
          class="font-body text-micro text-ink-muted -mt-2"
          data-testid="password-policy"
        >
          {{ POLICY_COPY }}
        </p>
        <label :class="FIELD_LABEL_CLASS">
          Confirm password
          <input
            v-model="confirm"
            :class="FIELD_INPUT_CLASS"
            data-testid="confirm-password"
            type="password"
            autocomplete="new-password"
          >
        </label>

        <button
          type="submit"
          :class="[PRIMARY_BUTTON_CLASS, 'mt-1']"
          data-testid="submit"
          :disabled="!password || !confirm || saving"
        >
          {{ saving ? 'Saving…' : 'Set password and sign in' }}
        </button>

        <p
          v-if="error"
          class="font-body text-caption text-error"
          role="alert"
          data-testid="password-error"
        >
          {{ error }}
        </p>
      </form>
    </div>
  </main>
</template>
