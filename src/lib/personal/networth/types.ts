export type LiabilityKind =
  | 'amortizing_loan' | 'bnpl' | 'credit_card' | 'overdraft' | 'other';

export type AssetKind =
  | 'cash' | 'real_estate' | 'vehicle' | 'gold_jewelry' | 'other';

export type PaymentCategory =
  | 'loan_payment' | 'card_payment' | 'overdraft_payment' | 'bnpl_payment'
  | 'charity' | 'rent' | 'utility' | 'phone' | 'subscription'
  | 'insurance' | 'school_fee' | 'other';

export type AmortizationInput = {
  principal: number;
  aprPct: number;
  termMonths: number;
  startDate: string;        // YYYY-MM-DD
  monthlyOverride?: number;
};

export type ScheduleRow = {
  installmentNo: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  remainingAfter: number;
};

export type EarlyPayoffResult = {
  newPayoffDate: string;
  totalInterestSaved: number;
  monthsSaved: number;
};
