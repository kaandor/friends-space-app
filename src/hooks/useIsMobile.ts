import { useEffect, useState } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    const narrow = window.innerWidth <= breakpoint
    // Detecta aparelho com tela touch (celular/tablet). Mesmo que o usuario
    // ative "Desktop site" no Chrome/Safari (que infla o viewport pra > 768px),
    // o touchscreen continua presente — usamos isso como indicador de que o
    // layout mobile e mais adequado.
    const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    return narrow || (touchDevice && window.innerWidth < 1280)
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => {
      const narrow = window.innerWidth <= breakpoint
      const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      setIsMobile(narrow || (touchDevice && window.innerWidth < 1280))
    }
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}