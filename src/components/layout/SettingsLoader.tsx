'use client'

import { useEffect } from 'react'
import { useSettingsStore } from '@/store/useSettingsStore'

export function SettingsLoader() {
  const loadFromServer = useSettingsStore(s => s.loadFromServer)
  const loaded = useSettingsStore(s => s._loaded)

  useEffect(() => {
    if (!loaded) loadFromServer()
  }, [loaded, loadFromServer])

  return null
}
