import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function Confirm({ trigger, title, description, confirmText = 'Tasdiqlash', destructive, onConfirm, open: openProp, onOpenChange, children }: {
  trigger?: React.ReactNode; title: string; description?: React.ReactNode; confirmText?: string; destructive?: boolean;
  onConfirm: () => Promise<unknown> | void; open?: boolean; onOpenChange?: (o: boolean) => void; children?: React.ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (o: boolean) => { setInner(o); onOpenChange?.(o); };
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            onClick={async (e) => { e.preventDefault(); setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
