'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function InlineEdit({
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [val, setVal] = useState(value)
  return (
    <div className="flex items-center gap-1 flex-1">
      <Input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-sm"
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) onSave(val.trim())
          if (e.key === 'Escape') onCancel()
        }}
      />
      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => val.trim() && onSave(val.trim())}>
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={onCancel}>
        <X className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  )
}
