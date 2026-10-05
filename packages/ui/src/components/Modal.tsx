import { useEffect, useId, useRef, type ReactNode } from "react"
import styles from "./Modal.module.css"

export function Modal({ open, title, onClose, children, footer, dismissible = true }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onCancel={dismissible ? undefined : (event) => event.preventDefault()}
      aria-labelledby={titleId}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>{title}</h2>
        {dismissible ? <button type="button" className={styles.close} onClick={onClose} aria-label="Close dialog">×</button> : null}
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </dialog>
  )
}
