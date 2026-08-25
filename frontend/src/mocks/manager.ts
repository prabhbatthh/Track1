// Manager duties: help members who walk in without an online seat/book
// reservation, taking their email and completing the booking/issue for them.
export type WalkInType = 'seat' | 'book';

export interface WalkInRequest {
  id: string;
  type: WalkInType;
  memberName: string;
  memberEmail: string;
  detail: string;
  requestedAt: string;
}

export interface RegistrationRequest {
  id: string;
  name: string;
  email: string;
  note: string;
  requestedAt: string;
}

// Members who'd rather pay a plan or fine in cash at the counter than online
// (see the "pay at the library" option on the payment page).
export interface PendingPayment {
  id: string;
  memberName: string;
  memberEmail: string;
  amount: number;
  reason: string;
  requestedAt: string;
}
