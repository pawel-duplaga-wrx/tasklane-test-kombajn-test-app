import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Label, User } from '../../shared/types.ts'
import { useEscape, useOutsideClick } from '../hooks.ts'
import { Icon } from './icons.tsx'
import { Avatar, LabelChip } from './ui.tsx'

/** Searchable person picker. `null` means unassigned. */
export function AssigneePicker({
  id,
  value,
  users,
  onChange,
  disabled,
}: {
  id?: string
  value: string | null
  users: User[]
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = users.find((u) => u.id === value) ?? null

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  useOutsideClick(ref, close, open)
  useEscape(close, open)

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const people = users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    return [...(q && !'unassigned'.includes(q) ? [] : [null]), ...people]
  }, [users, query])

  const choose = (user: User | null) => {
    onChange(user?.id ?? null)
    close()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const option = options[active]
      if (option !== undefined) choose(option)
    }
  }

  return (
    <div className="picker" ref={ref}>
      <button
        id={id}
        type="button"
        className="picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setActive(0)
          setOpen((v) => !v)
        }}
      >
        <Avatar user={selected} size={20} />
        <span className={selected ? '' : 'muted'}>{selected?.name ?? 'Unassigned'}</span>
        {!disabled && <Icon name="chevron-down" size={14} className="picker-chevron" />}
      </button>
      {open && (
        <div className="popover picker-popover">
          <input
            className="input input-sm"
            placeholder="Search people"
            aria-label="Search people"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={`${listId}-${active}`}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="picker-list" role="listbox" id={listId} aria-label="People">
            {options.length === 0 && <li className="picker-empty">No one matches "{query}"</li>}
            {options.map((user, i) => (
              <li
                key={user?.id ?? 'none'}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={(user?.id ?? null) === value}
                className={i === active ? 'picker-option is-active' : 'picker-option'}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(user)}
              >
                <Avatar user={user} size={20} />
                <span>{user?.name ?? 'Unassigned'}</span>
                {(user?.id ?? null) === value && <Icon name="check" size={14} className="picker-check" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function LabelPicker({
  id,
  value,
  labels,
  onChange,
  disabled,
}: {
  id?: string
  value: string[]
  labels: Label[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClick(ref, () => setOpen(false), open)
  useEscape(() => setOpen(false), open)
  const selected = labels.filter((l) => value.includes(l.id))

  const toggle = (labelId: string) => {
    onChange(value.includes(labelId) ? value.filter((v) => v !== labelId) : [...value, labelId])
  }

  return (
    <div className="picker" ref={ref}>
      <button id={id} type="button" className="picker-trigger picker-trigger-wrap" aria-haspopup="true" aria-expanded={open} disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {selected.length === 0 ? <span className="muted">{disabled ? 'No labels' : 'Add labels'}</span> : selected.map((l) => <LabelChip key={l.id} label={l} />)}
        {!disabled && <Icon name="chevron-down" size={14} className="picker-chevron" />}
      </button>
      {open && (
        <div className="popover picker-popover" role="group" aria-label="Labels">
          {labels.length === 0 && <p className="picker-empty">This project has no labels yet.</p>}
          {labels.map((label) => (
            <label key={label.id} className="picker-option picker-check-option">
              <input type="checkbox" checked={value.includes(label.id)} onChange={() => toggle(label.id)} />
              <span className="label-dot" style={{ background: label.color }} />
              {label.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
