const PRODUCTION_HOSTS = new Set(['sparks-effect.app', 'www.sparks-effect.app'])

export type DeployEnvironment = 'production' | 'staging'

export function environmentFor(hostname: string): DeployEnvironment {
  return PRODUCTION_HOSTS.has(hostname.toLowerCase()) ? 'production' : 'staging'
}
