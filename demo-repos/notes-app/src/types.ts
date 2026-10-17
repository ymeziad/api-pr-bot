export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface BillingOutcome {
  ok: boolean;
  id: string;
}
