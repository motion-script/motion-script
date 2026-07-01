'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TableOfContents, type TocEntry } from './TableOfContents'

export function TocPortal({ entries, editUrl }: { entries: TocEntry[]; editUrl?: string | null }) {
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<Element | null>(null)

  useEffect(() => {
    panelRef.current = document.getElementById('toc-panel')
    setMounted(true)
  }, [])

  if (!mounted || !panelRef.current) return null
  if (entries.length === 0 && !editUrl) return null
  return createPortal(<TableOfContents entries={entries} editUrl={editUrl} />, panelRef.current)
}
