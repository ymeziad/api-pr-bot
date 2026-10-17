export interface Booking {
  id: string;
  serviceId: string;
  customerId: string;
  startsAt: string; // ISO timestamp
  durationMinutes: number;
}

export interface PaymentOutcome {
  ok: boolean;
  id: string;
}
