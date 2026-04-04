"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// AppSelect — wrapper around shadcn Select that prevents the "raw ID" bug.
//
// By accepting an `options` array (and optional `groups`), the component
// automatically derives `items` for the underlying Select, ensuring the
// closed trigger always shows a human-readable label — even before the
// dropdown has been opened.
// ---------------------------------------------------------------------------

export type SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SelectOptionGroup = {
  label: string
  options: SelectOption[]
}

type AppSelectProps = {
  /** Flat list of options (mutually exclusive with `groups`). */
  options?: SelectOption[]
  /** Grouped options with section headers. */
  groups?: SelectOptionGroup[]
  /** Placeholder text shown when no value is selected. */
  placeholder?: string
  /** Currently selected value. */
  value?: string
  /** Called when the user picks an option. */
  onValueChange?: (value: string | null) => void
  /** Disable the entire select. */
  disabled?: boolean
  /** Trigger size variant. */
  size?: "sm" | "default"
  /** Additional className for the trigger. */
  className?: string
}

function AppSelect({
  options,
  groups,
  placeholder,
  value,
  onValueChange,
  disabled,
  size,
  className,
}: AppSelectProps) {
  // Build a flat items array for the Select label context.
  // This ensures the trigger always shows the correct label.
  const items = React.useMemo(() => {
    if (options) {
      return options.map((o) => ({ value: o.value, label: o.label }))
    }
    if (groups) {
      return groups.flatMap((g) =>
        g.options.map((o) => ({ value: o.value, label: o.label }))
      )
    }
    return []
  }, [options, groups])

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      items={items}
    >
      <SelectTrigger size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options &&
          options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        {groups &&
          groups.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
      </SelectContent>
    </Select>
  )
}

export { AppSelect }
