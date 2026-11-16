import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

/** Server xatosini forma maydonlariga yoki toast'ga chiqaradi. */
export function handleApiError<T extends FieldValues>(err: unknown, setError?: UseFormSetError<T>) {
  if (err instanceof ApiError) {
    const fields = err.fieldErrors;
    if (setError && Object.keys(fields).length) {
      for (const [k, v] of Object.entries(fields)) setError(k as Path<T>, { message: v.join(', ') });
      return;
    }
    toast.error(err.message, { description: err.code === 'INTEGRITY_RULE' ? "Ma'lumotlar yaxlitligi qoidasi" : undefined });
    return;
  }
  toast.error('Kutilmagan xatolik');
}
