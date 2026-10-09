import type { ReactNode } from 'react'

type Props = {
  titleId: string
  title: ReactNode
  subtitle?: ReactNode
  titleClassName?: string
  closeLabel: string
  onClose: () => void
  closeDisabled?: boolean
  children: ReactNode
}

export default function ModalShell({
  titleId,
  title,
  subtitle,
  titleClassName,
  closeLabel,
  onClose,
  closeDisabled = false,
  children,
}: Props) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId} className={titleClassName}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>

        {children}
      </section>
    </div>
  )
}
