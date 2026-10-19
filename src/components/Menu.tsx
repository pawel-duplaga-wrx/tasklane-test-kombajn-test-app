import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useEscape, useOutsideClick } from '../hooks.ts'

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
}

/** A button that opens a list of actions. */
export function Menu({
  label,
  button,
  items,
  align = 'end',
  className = 'icon-btn',
}: {
  /** Accessible name of the trigger button. */
  label: string
  button: ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useOutsideClick(ref, () => setOpen(false), open)
  useEscape(() => setOpen(false), open)
  const visible = items.filter((i) => !i.hidden)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <div className="menu-anchor" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {button}
      </button>
      {open && (
        <div className={`popover menu menu-${align}`} role="menu" id={menuId} aria-label={label}>
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? 'menu-item menu-item-danger' : 'menu-item'}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
