// jsdom 29 on Node 26+ leaves window.localStorage undefined: it defers to Node's
// built-in Web Storage, which stays disabled unless --localstorage-file is passed.
// sessionStorage is unaffected, and real browsers are unaffected — this gap exists
// only under the test environment, so the shim lives here rather than in the app.
if (typeof window !== 'undefined' && !window.localStorage) {
  const entries = new Map<string, string>()

  const memoryStorage: Storage = {
    get length() {
      return entries.size
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
  }

  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}
