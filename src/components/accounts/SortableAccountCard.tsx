'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { AccountCard } from './AccountCard'

interface SortableAccountCardProps {
  account: {
    id: string
    name: string
    bank?: string | null
    type: string
    color: string
    currentBalance: number
    _count?: { transactions: number }
  }
  isReordering: boolean
}

export function SortableAccountCard({ account, isReordering }: SortableAccountCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: account.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="relative"
    >
      {isReordering && (
        <>
          {/* Full-card drag overlay — blocks link navigation while reordering */}
          <div
            className="absolute inset-0 z-10 rounded-xl cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          />
          {/* Visual hint icon */}
          <div className="absolute top-2 right-2 z-20 pointer-events-none">
            <GripVertical className="h-4 w-4 text-muted-foreground/60" />
          </div>
        </>
      )}
      <AccountCard account={account} />
    </div>
  )
}
