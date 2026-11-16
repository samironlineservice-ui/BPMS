import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONES: Record<string, string> = {
  green: 'bg-success/15 text-success border-success/30',
  amber: 'bg-warning/15 text-warning border-warning/40',
  red: 'bg-destructive/10 text-destructive border-destructive/30',
  blue: 'bg-primary/10 text-primary border-primary/30',
  gray: 'bg-muted text-muted-foreground border-border',
};
const MAP: Record<string, [string, keyof typeof TONES]> = {
  ACTIVE: ['Faol', 'green'], LEAD: ['Lid', 'blue'], SUSPENDED: ["To'xtatilgan", 'amber'], CHURNED: ['Ketgan', 'gray'],
  ARCHIVED: ['Arxiv', 'gray'], INVITED: ['Taklif qilingan', 'blue'], LOCKED: ['Bloklangan', 'red'], DEACTIVATED: ["O'chirilgan", 'gray'],
  TRIALING: ['Sinov', 'blue'], PAST_DUE: ["Muddati o'tgan", 'amber'], CANCELLED: ['Bekor qilingan', 'gray'], EXPIRED: ['Tugagan', 'gray'],
  DRAFT: ['Qoralama', 'gray'], OPEN: ["To'lanmagan", 'amber'], PAID: ["To'langan", 'green'], VOID: ['Bekor (void)', 'gray'], UNCOLLECTIBLE: ['Undirilmaydigan', 'red'],
  PENDING_APPROVAL: ['Tasdiq kutilmoqda', 'amber'], POSTED: ['Tasdiqlangan', 'green'], REJECTED: ['Rad etilgan', 'red'],
  PENDING: ['Kutilmoqda', 'amber'], APPROVED: ['Tasdiqlangan', 'green'], EXECUTED: ['Bajarilgan', 'green'],
  REQUESTED: ["So'ralgan", 'amber'], SUCCEEDED: ['Bajarildi', 'green'], FAILED: ['Xato', 'red'], ROLLED_BACK: ['Qaytarildi', 'amber'],
  PLANNING: ['Rejada', 'blue'], IN_DEVELOPMENT: ['Ishlab chiqilmoqda', 'blue'], MAINTENANCE: ["Qo'llab-quvvatlash", 'green'], DEPRECATED: ['Eskirgan', 'gray'],
  PROSPECT: ['Potensial', 'blue'], ONBOARDING: ['Ulanmoqda', 'blue'],
  READY: ['Tayyor', 'blue'], PUBLISHED: ['Chiqarilgan', 'green'], REVOKED: ['Bekor qilingan', 'red'],
  SCHEDULED: ['Rejalashtirilgan', 'blue'], RUNNING: ['Bajarilmoqda', 'blue'], PAUSED: ["To'xtatilgan", 'amber'], COMPLETED: ['Yakunlangan', 'green'],
  INSTALLED: ["O'rnatilgan", 'green'], INSTALLING: ["O'rnatilmoqda", 'blue'], UNINSTALLED: ["O'chirilgan", 'gray'], DECOMMISSIONED: ['Foydalanishdan chiqqan', 'gray'],
  DISABLED: ["O'chirilgan", 'gray'],
  UPDATING: ['Yangilanmoqda', 'blue'], SKIPPED: ["O'tkazib yuborildi", 'gray'], VERIFYING: ['Tekshirilmoqda', 'blue'],
  DOWNLOADING: ['Yuklanmoqda', 'blue'], DOWNLOADED: ['Yuklandi', 'blue'], WAITING_WINDOW: ['Texnik oyna kutilmoqda', 'amber'],
  BLOCKED_ENTITLEMENT: ['Obuna to\'xtatilgan', 'red'], COMPLETED_WITH_ERRORS: ['Xatolar bilan', 'amber'],
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [text, tone] = MAP[status] ?? [status, 'gray'];
  return <Badge variant="outline" className={cn('font-medium', TONES[tone])}>{label ?? text}</Badge>;
}
