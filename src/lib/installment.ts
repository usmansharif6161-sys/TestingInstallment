export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatMoney(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return 'PKR 0';
  return `PKR ${Math.round(amount).toLocaleString('en-PK')}`;
}

export function buildInstallmentSchedule(params: {
  remainingBalance: number;
  numberOfInstallments: number;
  startDate?: Date;
}): { installmentAmount: number; dueDates: string[]; amounts: number[] } {
  const { remainingBalance, numberOfInstallments, startDate = new Date() } = params;

  if (numberOfInstallments <= 0) {
    throw new Error('Number of installments must be greater than 0');
  }

  const baseAmount = Math.floor((remainingBalance / numberOfInstallments) * 100) / 100;
  const amounts = Array.from({ length: numberOfInstallments }, () => baseAmount);
  const allocated = baseAmount * numberOfInstallments;
  const remainder = Math.round((remainingBalance - allocated) * 100) / 100;
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + remainder) * 100) / 100;

  const dueDates = amounts.map((_, index) => toDateString(addMonths(startDate, index + 1)));

  return {
    installmentAmount: baseAmount,
    dueDates,
    amounts,
  };
}

export function resolvePaymentDisplayStatus(
  status: string,
  dueDate: string,
  today = toDateString(new Date())
): 'paid' | 'unpaid' | 'overdue' {
  if (status === 'paid') return 'paid';
  if (dueDate < today) return 'overdue';
  return 'unpaid';
}
