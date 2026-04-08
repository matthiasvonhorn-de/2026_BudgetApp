'use client'

export const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#64748b',
]

export function ColorDot({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-6 h-6 rounded-full border-2 transition-transform ${selected ? 'border-foreground scale-110' : 'border-transparent'}`}
      style={{ backgroundColor: color }}
    />
  )
}
