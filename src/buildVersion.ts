export function shortCommitSha(sha: string | undefined): string {
  return sha?.trim().slice(0, 7) || 'dev'
}
