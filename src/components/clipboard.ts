function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  try {
    field.select()
    // Deprecated, but it is the only copy left where the Clipboard API is
    // missing (outside a secure context) or refused.
    return document.execCommand?.('copy') ?? false
  } catch {
    return false
  } finally {
    field.remove()
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    // navigator.clipboard is missing outside a secure context; reading
    // writeText off it throws here, and lands in the same fallback.
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyBySelection(text)
  }
}
