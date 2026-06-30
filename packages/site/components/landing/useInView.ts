'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

interface UseInViewOptions {
  once?: boolean
  margin?: string
}

export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {},
): [RefObject<T | null>, boolean] {
  const { once = false, margin = '0px' } = options
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin: margin },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [once, margin])

  return [ref, inView]
}
