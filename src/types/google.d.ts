export {}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential: string }) => void
            cancel_on_tap_outside?: boolean
          }) => void
          renderButton: (parent: HTMLElement, options?: Record<string, unknown>) => void
          prompt: () => void
          disableAutoSelect: () => void
          revoke: (hint: string, callback: () => void) => void
        }
      }
    }
  }
}
