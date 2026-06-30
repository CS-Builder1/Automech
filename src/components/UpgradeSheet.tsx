import { useNavigate } from 'react-router-dom'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'

interface Props {
  open: boolean
  title: string
  body: string
  onClose: () => void
}

/** Shown when a free-tier cap is hit — nudges to Plans rather than hard-blocking. */
export function UpgradeSheet({ open, title, body, onClose }: Props) {
  const navigate = useNavigate()
  if (!open) return null
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
        <div className="flex gap-3">
          <Button full onClick={() => { onClose(); navigate('/plans') }}>See plans</Button>
          <Button variant="secondary" onClick={onClose}>Not now</Button>
        </div>
      </div>
    </Sheet>
  )
}
