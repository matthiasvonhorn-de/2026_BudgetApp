'use client'

import { useState, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { arrayMove } from '@dnd-kit/sortable'
import type { DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import type { Account } from '@/types/api'

export function useAccountReorder(accounts: Account[]) {
  const qc = useQueryClient()
  const [isReordering, setIsReordering] = useState(false)
  const [localAccounts, setLocalAccounts] = useState<Account[]>([])
  const snapshotRef = useRef<Account[]>([])

  const startReorder = useCallback(() => {
    snapshotRef.current = [...accounts]
    setLocalAccounts([...accounts])
    setIsReordering(true)
  }, [accounts])

  const cancelReorder = useCallback(() => {
    setIsReordering(false)
    setLocalAccounts([])
  }, [])

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) =>
      fetch('/api/accounts/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then(r => {
        if (!r.ok) throw new Error('Fehler beim Speichern')
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      setIsReordering(false)
      setLocalAccounts([])
      toast.success('Reihenfolge gespeichert')
    },
    onError: () => {
      setLocalAccounts(snapshotRef.current)
      toast.error('Fehler beim Speichern der Reihenfolge')
    },
  })

  const saveReorder = useCallback(() => {
    reorderMutation.mutate(localAccounts.map(a => a.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAccounts])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalAccounts(prev => {
      const oldIndex = prev.findIndex(a => a.id === active.id)
      const newIndex = prev.findIndex(a => a.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  return {
    isReordering,
    localAccounts: isReordering ? localAccounts : accounts,
    startReorder,
    cancelReorder,
    saveReorder,
    handleDragEnd,
    isSaving: reorderMutation.isPending,
  }
}
