export interface MoneyByCurrency { currency: string; amountMinor: string }

export interface DashboardDto {
  asOf: string;
  usdRate: string | null;
  finance: null | {
    mrr: MoneyByCurrency[]; mrrUzsMinor: string;
    receivable: MoneyByCurrency[]; overdue: MoneyByCurrency[]; receivableUzsMinor: string; overdueUzsMinor: string;
    collectedThisMonthUzsMinor: string; collectedPrevMonthUzsMinor: string; invoicedThisMonthUzsMinor: string;
    subscriptions: { active: number; trialing: number; pastDue: number; suspended: number };
    trend: { month: string; mrrUzsMinor: string; collectedUzsMinor: string; invoicedUzsMinor: string }[];
    topOverdue: { id: string; number: string | null; clientId: string; clientName: string; currency: string; outstandingMinor: string; dueDate: string | null; overdueDays: number }[];
    upcomingBilling: number;
  };
  clients: { active: number; lead: number; newThisMonth: number };
  ops: null | { devicesActive: number; devicesByClass: { deviceClass: string; count: number }[]; deploymentsRunning: number; deploymentsPendingApproval: number; deploymentsFailed30d: number };
  approvalsPending: number;
}

export interface ReportsDto {
  from: string; to: string;
  mrrMovements: { month: string; type: string; currency: string; deltaMinor: string }[];
  aging: { currency: string; bucket: string; amountMinor: string; invoices: number }[];
  revenueByProject: { projectId: string | null; projectName: string; currency: string; amountMinor: string; amountUzsMinor: string }[];
  paymentsByMethod: { method: string; currency: string; amountMinor: string; count: number }[];
  topClients: { clientId: string; clientName: string; amountUzsMinor: string }[];
}
