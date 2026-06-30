'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TableOfContents, type TocEntry } from './TableOfContents'

export function TocPortal({ entries }: { entries: TocEntry[] }) {
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<Element | null>(null)

  useEffect(() => {
    panelRef.current = document.getElementById('toc-panel')
    setMounted(true)
  }, [])

  if (!mounted || !panelRef.current || entries.length === 0) return null
  return createPortal(<TableOfContents entries={entries} />, panelRef.current)
}
