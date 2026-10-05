import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { applyUpdateAction, reviewUpdate } from "../lib/api.ts"
import { Modal } from "./Modal.tsx"
import { Button, Chip } from "./primitives.tsx"
import { useToast } from "./toast.tsx"
import styles from "./UpdateReviewModal.module.css"

export function UpdateReviewModal({ id, name, open, onClose }: { id: string; name: string; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const review = useQuery({ queryKey: ["update", id], queryFn: () => reviewUpdate(id), enabled: open, retry: false })
  const apply = useMutation({
    mutationFn: () => applyUpdateAction(id),
    onSuccess: async () => {
      toast(`Updated ${name}.`, "success")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["skill", id] }),
        queryClient.invalidateQueries({ queryKey: ["skills"] }),
        queryClient.invalidateQueries({ queryKey: ["status"] }),
        queryClient.invalidateQueries({ queryKey: ["review"] }),
      ])
      onClose()
    },
    onError: (error) => toast(error instanceof Error ? error.message : "update failed", "error"),
  })

  return (
    <Modal
      open={open}
      title={`Update ${name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={review.data?.kind !== "update" || apply.isPending} onClick={() => apply.mutate()}>
            Apply update
          </Button>
        </>
      }
    >
      {review.isPending ? (
        <p>Fetching the pinned revision…</p>
      ) : review.isError ? (
        <p>{review.error instanceof Error ? review.error.message : "Could not fetch the update."}</p>
      ) : review.data?.kind !== "update" ? (
        <p>{review.data?.kind === "blocked" ? `Update blocked: ${review.data.blockedFindings?.join(", ") || "the skill status changed"}` : "This skill is already up to date."}</p>
      ) : (
        <div className="stack">
          <p className={styles.delta}>
            score {review.data.scoreDelta?.from} → {review.data.scoreDelta?.to} · risk {review.data.riskDelta?.from} → {review.data.riskDelta?.to}
          </p>
          <ul className={styles.changes}>
            {review.data.changes?.map((change) => (
              <li key={change.path} className={styles.change}>
                <Chip tone={change.status === "added" ? "low" : change.status === "removed" ? "critical" : "medium"}>{change.status}</Chip>
                <span className={styles.path}>{change.path}</span>
                {change.patch ? (
                  <details className={styles.patch}>
                    <summary>patch</summary>
                    <pre>{change.patch}</pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
