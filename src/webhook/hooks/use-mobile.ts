import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Read through useSyncExternalStore rather than mirroring the media query into state — the match
// is external state, and the effect-plus-setState version trips react-hooks/set-state-in-effect.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
