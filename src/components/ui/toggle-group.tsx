import * as React from "react"
import { VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { toggleVariants } from "./toggle"

const ToggleGroupContext = React.createContext<{
  size?: VariantProps<typeof toggleVariants>["size"]
  variant?: VariantProps<typeof toggleVariants>["variant"]
  value?: string[]
  onValueChange?: (value: any) => void
  type?: "single" | "multiple"
}>({})

const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    type?: "single" | "multiple"
    value?: string | string[]
    onValueChange?: (value: any) => void
    size?: VariantProps<typeof toggleVariants>["size"]
    variant?: VariantProps<typeof toggleVariants>["variant"]
  }
>(({ className, variant, size, children, type = "single", value, onValueChange, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState<string[]>(
    Array.isArray(value) ? value : value ? [value] : []
  )

  React.useEffect(() => {
    setInternalValue(Array.isArray(value) ? value : value ? [value] : [])
  }, [value])

  const handleValueChange = (val: string) => {
    let newValue: string[]
    if (type === "single") {
      newValue = internalValue.includes(val) ? [] : [val]
    } else {
      newValue = internalValue.includes(val)
        ? internalValue.filter((v) => v !== val)
        : [...internalValue, val]
    }
    
    setInternalValue(newValue)
    onValueChange?.(type === "single" ? newValue[0] : newValue)
  }

  return (
    <div
      ref={ref}
      className={cn("flex items-center justify-center gap-1", className)}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ 
          size, 
          variant, 
          value: internalValue, 
          onValueChange: handleValueChange,
          type 
        }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </div>
  )
})

ToggleGroup.displayName = "ToggleGroup"

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value: string
    size?: VariantProps<typeof toggleVariants>["size"]
    variant?: VariantProps<typeof toggleVariants>["variant"]
  }
>(({ className, children, value, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)
  const isPressed = context.value?.includes(value)

  return (
    <button
      type="button"
      ref={ref}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        isPressed && "bg-accent text-accent-foreground",
        className
      )}
      onClick={() => context.onValueChange?.(value)}
      data-state={isPressed ? "on" : "off"}
      {...props}
    >
      {children}
    </button>
  )
})

ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem }
