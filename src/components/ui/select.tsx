"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Label-tracking context
// Base UI's SelectValue resolves the display label from a store `items` prop.
// When no `items` prop is given (our typical usage), it falls back to the raw
// value string. We solve this by tracking value→label mappings ourselves:
// SelectItem registers its label when it mounts; SelectValue subscribes and
// re-renders to display the correct label.
// ---------------------------------------------------------------------------

type LabelsContextValue = {
  register: (value: string, label: string) => void
  getLabel: (value: string) => string | undefined
  subscribe: (cb: () => void) => () => void
  itemToStringLabel?: (value: string) => string
}

const SelectLabelsContext = React.createContext<LabelsContextValue>({
  register: () => {},
  getLabel: () => undefined,
  subscribe: () => () => {},
})

function extractTextContent(node: React.ReactNode): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextContent).join("")
  if (React.isValidElement(node)) {
    return extractTextContent((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

// ---------------------------------------------------------------------------
// Select (Root) – provides label context
// ---------------------------------------------------------------------------

function Select<Value = string, Multiple extends boolean | undefined = false>({
  children,
  items,
  itemToStringLabel,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple> & {
  items?: Array<{ value: string; label: string }>
  itemToStringLabel?: (value: string) => string
}) {
  const labelsRef = React.useRef(new Map<string, string>())
  const subscribersRef = React.useRef(new Set<() => void>())
  const itemToStringLabelRef = React.useRef(itemToStringLabel)
  React.useEffect(() => { itemToStringLabelRef.current = itemToStringLabel }, [itemToStringLabel])

  // Pre-register items provided directly (for dynamic/ID-based selects)
  React.useEffect(() => {
    if (!items) return
    items.forEach(({ value, label }) => labelsRef.current.set(value, label as string))
    subscribersRef.current.forEach((cb) => cb())
  }, [items])

  const ctx = React.useMemo(
    (): LabelsContextValue => ({
      register: (value: string, label: string) => {
        labelsRef.current.set(value, label)
        subscribersRef.current.forEach((cb) => cb())
      },
      getLabel: (value: string) => labelsRef.current.get(value),
      subscribe: (cb: () => void) => {
        subscribersRef.current.add(cb)
        return () => subscribersRef.current.delete(cb)
      },
      itemToStringLabel: (v: string) => itemToStringLabelRef.current?.(v) ?? v,
    }),
    [],
  )

  return (
    <SelectLabelsContext.Provider value={ctx}>
      <SelectPrimitive.Root {...props}>
        {children}
      </SelectPrimitive.Root>
    </SelectLabelsContext.Provider>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// SelectValue – subscribes to label context and renders the correct label
// ---------------------------------------------------------------------------

function SelectValue({ className, children, placeholder, ...props }: SelectPrimitive.Value.Props) {
  const { getLabel, subscribe, itemToStringLabel } = React.useContext(SelectLabelsContext)
  const [, rerender] = React.useReducer((x: number) => x + 1, 0)

  React.useEffect(() => {
    return subscribe(rerender)
  }, [subscribe])

  // If the caller provides an explicit children (e.g. a render function or
  // static content) forward it directly to Base UI.
  if (children != null) {
    return (
      <SelectPrimitive.Value
        data-slot="select-value"
        className={cn("flex flex-1 text-left", className)}
        placeholder={placeholder}
        {...props}
      >
        {children}
      </SelectPrimitive.Value>
    )
  }

  // Default: use our label context, falling back to the raw value string.
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      placeholder={placeholder}
      {...props}
    >
      {(value: unknown) => {
        if (value == null || value === "") return null
        const key = String(value)
        return getLabel(key) ?? itemToStringLabel?.(key) ?? key
      }}
    </SelectPrimitive.Value>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-50 max-h-(--available-height) min-w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// SelectItem – registers its label in the context when mounted
// ---------------------------------------------------------------------------

function SelectItem({
  className,
  children,
  value,
  ...props
}: SelectPrimitive.Item.Props) {
  const { register } = React.useContext(SelectLabelsContext)

  // Register the label when this item mounts (popup open) so SelectValue can
  // display it. Labels persist in the context ref after the popup closes.
  React.useLayoutEffect(() => {
    if (value != null) {
      const label = extractTextContent(children)
      if (label) register(String(value), label)
    }
    // No cleanup – labels must persist after unmount so SelectValue keeps working
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, children])

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      value={value}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
