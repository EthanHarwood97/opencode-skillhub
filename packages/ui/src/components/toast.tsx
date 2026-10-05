import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import styles from "./toast.module.css"

type ToastTone = "info" | "success" | "error"
type Toast = { id: number; message: string; tone: ToastTone }

const TONE_CLASS: Record<ToastTone, string> = { info: styles.toneInfo, success: styles.toneSuccess, error: styles.toneError }
const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className={styles.host} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${TONE_CLASS[toast.tone]}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
