import { fetchRoute } from '../api/authoring'
import type { Route } from '../api/authoring'
import { useOwnedDetail } from './useOwnedDetail'

export function useRouteDetail(slug: string) {
  const { item: route, loading, notFound, error } = useOwnedDetail<Route>(fetchRoute, slug)
  return { route, loading, notFound, error }
}
