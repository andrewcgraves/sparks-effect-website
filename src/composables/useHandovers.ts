import { ref } from 'vue'
import { ApiError, isSessionExpiry } from '../api/authoring/client'
import {
  acceptHandover,
  cancelHandover,
  declineHandover,
  fetchMyHandovers,
  handoverBlockingScenarios,
  offerHandover,
  type IncomingHandover,
  type OutgoingHandover,
} from '../api/authoring/handovers'
import { authoringFault } from '../api/authoringFault'
import { useConfirm } from './useConfirm'
import { useToast } from './useToast'

export const OFFER_EXPLANATION =
  "They'll see this on their authoring page and can accept it. The public page keeps its address. You'll lose access once they accept."

// Worded so it is true whether or not the address is an account: the API
// answers both the same way, and the page must not be the one to tell them apart.
export const OFFER_SENT = "Offer sent. If they have an account, they'll see it on their authoring page."

const NO_LONGER_OPEN = 'That offer is no longer open.'

const expiryFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function expiryDate(handover: { expires_at: string }): string {
  return expiryFormat.format(new Date(handover.expires_at))
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

function offerFault(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return 'This line already has a transfer waiting to be accepted.'
  if (err instanceof ApiError && err.status === 422) return "That's your own address."
  return authoringFault(err, 'service')
}

function refusalSentence(handover: IncomingHandover, scenarios: string[]): string {
  const sender = handover.from_name
  if (scenarios.length === 0) return `${sender} has to take this line out of their networks before you can accept it.`
  const named = scenarios.join(', ')
  const noun = scenarios.length === 1 ? 'network' : 'networks'
  return `${sender} has to take this line out of their ${noun} first: ${named}.`
}

// The lists are re-read after each action rather than patched, because an
// accept or a cancel can race the other party's own decision.
export function useHandovers() {
  const { confirm, confirmWithEmail } = useConfirm()
  const { show: toast } = useToast()

  const incoming = ref<IncomingHandover[]>([])
  const outgoing = ref<OutgoingHandover[]>([])
  const loading = ref(true)
  const error = ref(false)
  const busy = ref(false)
  const refusals = ref<Record<string, string>>({})

  async function reload(): Promise<void> {
    try {
      const mine = await fetchMyHandovers()
      incoming.value = mine.incoming
      outgoing.value = mine.outgoing
      error.value = false
    } catch (err) {
      if (isSessionExpiry(err)) return
      error.value = true
    }
    loading.value = false
  }

  function outgoingFor(serviceSlug: string): OutgoingHandover | undefined {
    return outgoing.value.find((handover) => handover.service_slug === serviceSlug)
  }

  // A decision on an offer that has since closed — cancelled, declined,
  // accepted elsewhere or expired — is reported the same way whichever it was,
  // and the lists are re-read so the stale row goes. A failure `refused`
  // claims is the caller's to word.
  async function decide(
    run: () => Promise<unknown>,
    words: { success: string; failure: string },
    refused: (err: unknown) => boolean = () => false,
  ): Promise<boolean> {
    busy.value = true
    try {
      await run()
    } catch (err) {
      if (isSessionExpiry(err) || refused(err)) return false
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) toast(NO_LONGER_OPEN, { kind: 'error' })
      else toast(`${words.failure}: ${lowerFirst(authoringFault(err, 'service'))}`, { kind: 'error' })
      await reload()
      return false
    } finally {
      busy.value = false
    }
    toast(words.success)
    await reload()
    return true
  }

  async function offer(service: { slug: string; name: string }): Promise<void> {
    if (busy.value) return
    const email = await confirmWithEmail({
      title: `Transfer '${service.name}'`,
      body: OFFER_EXPLANATION,
      emailLabel: 'Their email',
      confirmLabel: 'Send offer',
    })
    if (email === null) return
    busy.value = true
    try {
      await offerHandover(service.slug, email)
    } catch (err) {
      if (isSessionExpiry(err)) return
      toast(`Not sent: ${lowerFirst(offerFault(err))}`, { kind: 'error' })
      return
    } finally {
      busy.value = false
    }
    toast(OFFER_SENT)
    await reload()
  }

  async function cancel(handover: OutgoingHandover): Promise<void> {
    if (busy.value) return
    const confirmed = await confirm({
      title: `Cancel the transfer of '${handover.service_name}'?`,
      body: `${handover.to_name} won't be able to accept it. You can offer it again later.`,
      confirmLabel: 'Cancel transfer',
      cancelLabel: 'Keep the offer',
      destructive: true,
    })
    if (!confirmed) return
    await decide(() => cancelHandover(handover.id), { success: 'Transfer cancelled', failure: 'Not cancelled' })
  }

  async function decline(handover: IncomingHandover): Promise<void> {
    if (busy.value) return
    const confirmed = await confirm({
      title: `Decline '${handover.service_name}'?`,
      body: `It stays with ${handover.from_name}, who can offer it again.`,
      confirmLabel: 'Decline',
      cancelLabel: 'Keep the offer',
      destructive: true,
    })
    if (!confirmed) return
    await decide(() => declineHandover(handover.id), { success: 'Transfer declined', failure: 'Not declined' })
  }

  // The scenario refusal is the one failure the recipient cannot fix by trying
  // again, so it stays on the row, in words, until the lists say otherwise.
  async function accept(handover: IncomingHandover): Promise<boolean> {
    if (busy.value) return false
    refusals.value = Object.fromEntries(Object.entries(refusals.value).filter(([id]) => id !== handover.id))
    return decide(
      () => acceptHandover(handover.id),
      { success: 'Transfer accepted', failure: 'Not accepted' },
      (err) => {
        const scenarios = handoverBlockingScenarios(err)
        if (!scenarios) return false
        refusals.value = { ...refusals.value, [handover.id]: refusalSentence(handover, scenarios) }
        return true
      },
    )
  }

  void reload()

  return { incoming, outgoing, loading, error, busy, refusals, outgoingFor, reload, offer, cancel, decline, accept }
}
