import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { handleApiError } from '@/lib/errors';

export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/auth/password', { currentPassword: cur, newPassword: pw }),
    onSuccess: () => { toast.success("Parol o'zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi."); onOpenChange(false); },
    onError: (e) => handleApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (o) { setCur(''); setPw(''); setPw2(''); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Parolni o'zgartirish</DialogTitle><DialogDescription>Kamida 12 belgi. Boshqa qurilmalardan chiqib ketiladi.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Joriy parol"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="Yangi parol" hint="Kamida 12 belgi"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Yangi parolni takrorlang" error={pw2 && pw !== pw2 ? 'Parollar mos emas' : undefined}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <DialogFooter><Button type="submit" disabled={!cur || pw.length < 12 || pw !== pw2 || m.isPending}>Saqlash</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
