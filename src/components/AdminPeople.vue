<script setup lang="ts">
import { reactive, ref } from 'vue'
import {
  INVITE_LIFETIME_MS,
  RESET_LIFETIME_MS,
  createInvite,
  createResetLink,
  listUsers,
  updateUser,
  type AdminUser,
  type UserChange,
} from '../api/admin'
import { adminFault } from '../api/adminFault'
import { isSessionExpiry } from '../api/authoring/client'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'
import { ACTION_LINK_CLASS } from './linkStyles'
import CopyLinkField from './CopyLinkField.vue'

interface IssuedLink {
  kind: 'Invite' | 'Reset'
  email: string
  url: string
  expiresAt: number
}

const auth = useAuthStore()
const { confirm } = useConfirm()
const { show: toast } = useToast()

const users = ref<AdminUser[]>([])
const loading = ref(true)
const loadFailed = ref(false)
const busyId = ref<string | null>(null)
const issued = ref<IssuedLink | null>(null)

const inviting = ref(false)
const inviteBusy = ref(false)
const inviteError = ref('')
const invite = reactive({ email: '', name: '', isAdmin: false })

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// A reload after an action keeps the rows on screen; only the first read shows
// the loading line.
async function load(): Promise<void> {
  try {
    users.value = await listUsers()
    loadFailed.value = false
  } catch (err: unknown) {
    if (isSessionExpiry(err)) return
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

void load()

function isSelf(user: AdminUser): boolean {
  return user.id === auth.userId
}

async function change(user: AdminUser, patch: UserChange, done: string): Promise<void> {
  busyId.value = user.id
  try {
    await updateUser(user.id, patch)
    toast(done)
    await load()
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) toast(adminFault(err, 'update'), { kind: 'error' })
  } finally {
    busyId.value = null
  }
}

function toggleAdmin(user: AdminUser): Promise<void> {
  const promoting = !user.is_admin
  return change(user, { is_admin: promoting }, promoting ? `${user.email} is now an admin` : `${user.email} is no longer an admin`)
}

async function toggleDisabled(user: AdminUser): Promise<void> {
  const disabling = !user.disabled_at
  const ok = await confirm(disabling
    ? {
        title: `Disable ${user.email}?`,
        body: 'They are signed out everywhere and can’t sign in again until re-enabled. Their lines and published pages stay up.',
        confirmLabel: 'Disable',
        destructive: true,
      }
    : {
        title: `Re-enable ${user.email}?`,
        body: 'They can sign in again with their existing password.',
        confirmLabel: 'Enable',
        destructive: false,
      })
  if (!ok) return
  await change(
    user,
    { disabled: disabling },
    disabling ? `${user.email} is disabled` : `${user.email} is enabled`,
  )
}

async function issueReset(user: AdminUser): Promise<void> {
  busyId.value = user.id
  try {
    const { url } = await createResetLink(user.id)
    issued.value = { kind: 'Reset', email: user.email, url, expiresAt: Date.now() + RESET_LIFETIME_MS }
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) toast(adminFault(err, 'reset'), { kind: 'error' })
  } finally {
    busyId.value = null
  }
}

function openInvite(): void {
  Object.assign(invite, { email: '', name: '', isAdmin: false })
  inviteError.value = ''
  inviting.value = true
}

async function sendInvite(): Promise<void> {
  inviteBusy.value = true
  inviteError.value = ''
  try {
    const created = await createInvite({ email: invite.email.trim(), name: invite.name.trim(), is_admin: invite.isAdmin })
    inviting.value = false
    issued.value = {
      kind: 'Invite',
      email: created.user.email ?? invite.email.trim(),
      url: created.url,
      expiresAt: Date.now() + INVITE_LIFETIME_MS,
    }
    await load()
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) inviteError.value = adminFault(err, 'invite')
  } finally {
    inviteBusy.value = false
  }
}
</script>

<template>
  <section aria-labelledby="people-heading">
    <div class="flex items-center justify-between gap-3">
      <h2
        id="people-heading"
        class="font-display text-h2 text-ink-true"
      >
        People
      </h2>
      <button
        v-if="!inviting"
        type="button"
        :class="ACTION_LINK_CLASS"
        data-testid="invite-open"
        @click="openInvite"
      >
        + Invite
      </button>
    </div>

    <form
      v-if="inviting"
      class="mt-4 flex flex-col gap-3 rounded-(--radius-box) border border-border bg-surface p-4"
      data-testid="invite-form"
      @submit.prevent="sendInvite"
    >
      <label :class="FIELD_LABEL_CLASS">
        Email
        <input
          v-model="invite.email"
          type="email"
          required
          autocomplete="off"
          :class="FIELD_INPUT_CLASS"
          data-testid="invite-email"
        >
      </label>
      <label :class="FIELD_LABEL_CLASS">
        Name
        <input
          v-model="invite.name"
          type="text"
          autocomplete="off"
          :class="FIELD_INPUT_CLASS"
          data-testid="invite-name"
        >
      </label>
      <label class="font-body text-caption flex items-center gap-2 text-ink">
        <input
          v-model="invite.isAdmin"
          type="checkbox"
          data-testid="invite-admin"
        >
        Make them an admin
      </label>
      <p
        v-if="inviteError"
        class="font-body text-caption text-error"
        role="alert"
        data-testid="invite-error"
      >
        {{ inviteError }}
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          :class="PRIMARY_BUTTON_CLASS"
          :disabled="inviteBusy"
          data-testid="invite-submit"
        >
          Create invite link
        </button>
        <button
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          data-testid="invite-cancel"
          @click="inviting = false"
        >
          Cancel
        </button>
      </div>
    </form>

    <div
      v-if="issued"
      class="mt-4 flex flex-col gap-2 rounded-(--radius-box) border border-border bg-surface p-4"
      data-testid="issued-link"
    >
      <p class="font-body text-caption text-ink">
        {{ issued.kind }} link for <strong>{{ issued.email }}</strong>. Send it to them however you like; it works once.
      </p>
      <CopyLinkField
        :url="issued.url"
        :label="`${issued.kind} link for ${issued.email}`"
      />
      <p class="font-body text-micro text-ink-muted">
        Expires around {{ dateTimeFormat.format(issued.expiresAt) }}
      </p>
    </div>

    <p
      v-if="loading"
      class="font-body text-caption mt-4 text-ink-muted italic"
    >
      Loading…
    </p>
    <p
      v-else-if="loadFailed && users.length === 0"
      class="font-body text-caption mt-4 text-error"
      role="alert"
      data-testid="people-error"
    >
      Couldn't load the accounts.
    </p>
    <div
      v-else
      class="mt-4 overflow-x-auto"
    >
      <table class="font-body text-caption w-full border-collapse text-left text-ink">
        <thead class="text-micro text-ink-muted uppercase">
          <tr>
            <th class="py-2 pr-4 font-normal">
              Email
            </th>
            <th class="py-2 pr-4 font-normal">
              Name
            </th>
            <th class="py-2 pr-4 font-normal">
              Role
            </th>
            <th class="py-2 pr-4 font-normal">
              State
            </th>
            <th class="py-2 pr-4 font-normal">
              Created
            </th>
            <th class="py-2 pr-4 text-right font-normal">
              Lines
            </th>
            <th class="py-2 pr-4 text-right font-normal">
              Published
            </th>
            <th class="py-2 font-normal">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-t border-border align-top"
            :data-testid="`user-row-${user.id}`"
          >
            <td class="py-2 pr-4 break-all">
              {{ user.email }}
              <span
                v-if="isSelf(user)"
                class="text-micro text-ink-muted"
              >(you)</span>
            </td>
            <td class="py-2 pr-4">
              {{ user.name }}
            </td>
            <td class="py-2 pr-4">
              {{ user.is_admin ? 'Admin' : 'Member' }}
            </td>
            <td class="py-2 pr-4">
              <span :class="user.disabled_at ? 'text-error' : ''">{{ user.disabled_at ? 'Disabled' : 'Active' }}</span>
            </td>
            <td class="py-2 pr-4 whitespace-nowrap">
              {{ dateFormat.format(new Date(user.created_at)) }}
            </td>
            <td
              class="py-2 pr-4 text-right tabular-nums"
              data-testid="service-count"
            >
              {{ user.service_count }}
            </td>
            <td
              class="py-2 pr-4 text-right tabular-nums"
              data-testid="published-count"
            >
              {{ user.published_count }}
            </td>
            <td class="py-2">
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  :class="SECONDARY_BUTTON_CLASS"
                  :disabled="isSelf(user) || busyId === user.id"
                  :title="isSelf(user) ? 'You can’t demote yourself' : undefined"
                  data-testid="toggle-admin"
                  @click="toggleAdmin(user)"
                >
                  {{ user.is_admin ? 'Demote' : 'Promote' }}
                </button>
                <button
                  type="button"
                  :class="SECONDARY_BUTTON_CLASS"
                  :disabled="isSelf(user) || busyId === user.id"
                  :title="isSelf(user) ? 'You can’t disable yourself' : undefined"
                  data-testid="toggle-disabled"
                  @click="toggleDisabled(user)"
                >
                  {{ user.disabled_at ? 'Enable' : 'Disable' }}
                </button>
                <button
                  type="button"
                  :class="SECONDARY_BUTTON_CLASS"
                  :disabled="busyId === user.id"
                  data-testid="reset-link"
                  @click="issueReset(user)"
                >
                  Reset link
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
