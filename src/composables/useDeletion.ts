import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, isSessionExpiry } from '../api/authoring/client'
import { AUTHORING_NOUN_WORDS, authoringFault, type AuthoringNoun } from '../api/authoringFault'
import { deleteService } from '../api/authoring/services'
import { deleteScenario, fetchMyScenarios } from '../api/authoring/scenarios'
import { fetchServicePublication } from '../api/publications'
import { useConfirm } from './useConfirm'
import { useToast } from './useToast'

interface DeletionTarget {
  id: string
  slug: string
  name: string
}

interface ServiceDeletionCost {
  scenarioCount: number | null
  published: boolean | null
}

const NO_UNDO = "This can't be undone."

// A lookup that failed reads as null, and the sentence hedges rather than
// dropping the warning: the author should still hear that a public page or a
// network may be at stake.
export function serviceDeletionBody({ scenarioCount, published }: ServiceDeletionCost): string {
  let history = 'Its compile history goes too'
  if (scenarioCount === null) history += ", and it will be removed from any network it's in"
  else if (scenarioCount > 0) {
    history += `, and it will be removed from ${scenarioCount} ${scenarioCount === 1 ? 'network' : 'networks'}`
  }
  const sentences = [`${history}.`]
  if (published === true) sentences.push('Its public page will stop working.')
  else if (published === null) sentences.push("If it's published, its public page will stop working.")
  sentences.push(NO_UNDO)
  return sentences.join(' ')
}

async function serviceDeletionCost(service: DeletionTarget): Promise<ServiceDeletionCost> {
  const [scenarios, publication] = await Promise.allSettled([
    fetchMyScenarios(),
    fetchServicePublication(service.slug),
  ])
  let published: boolean | null = null
  if (publication.status === 'fulfilled') published = true
  else if (publication.reason instanceof ApiError && publication.reason.status === 404) published = false
  return {
    scenarioCount: scenarios.status === 'fulfilled'
      ? scenarios.value.filter((scenario) => scenario.service_ids.includes(service.id)).length
      : null,
    published,
  }
}

function useDeletion(
  noun: AuthoringNoun,
  confirmBody: (target: DeletionTarget) => Promise<string>,
  deleteBySlug: (slug: string) => Promise<void>,
) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const { show: toast } = useToast()
  const deleting = ref(false)

  // Busy from the click, not from the confirm: the cost is looked up first,
  // and a second click in that gap must not raise a second dialog.
  async function confirmAndDelete(target: DeletionTarget): Promise<boolean> {
    if (deleting.value) return false
    deleting.value = true
    try {
      const confirmed = await confirm({
        title: `Delete '${target.name}'?`,
        body: await confirmBody(target),
        confirmLabel: `Delete ${AUTHORING_NOUN_WORDS[noun]}`,
        cancelLabel: 'Keep it',
        destructive: true,
      })
      if (!confirmed) return false
      await deleteBySlug(target.slug)
    } catch (err) {
      // The user is already being sent to sign in; an error toast on the way
      // out would only say so less clearly.
      if (isSessionExpiry(err)) return false
      const fault = authoringFault(err, noun)
      toast(`Not deleted: ${fault.charAt(0).toLowerCase()}${fault.slice(1)}`, { kind: 'error' })
      return false
    } finally {
      deleting.value = false
    }
    toast(`Deleted '${target.name}'`)
    await router.push('/authoring')
    return true
  }

  return { deleting, confirmAndDelete }
}

export function useServiceDeletion() {
  return useDeletion('service', async (service) => serviceDeletionBody(await serviceDeletionCost(service)), deleteService)
}

export function useScenarioDeletion() {
  return useDeletion(
    'scenario',
    async () => `Its compiled graph goes too. Its lines aren't deleted. ${NO_UNDO}`,
    deleteScenario,
  )
}
