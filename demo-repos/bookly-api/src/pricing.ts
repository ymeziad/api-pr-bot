import type { Booking } from "./types";

const HOURLY_RATES: Record<string, number> = {
  haircut: 4000,
  massage: 9000,
  consult: 15000,
};

export function bookingPrice(booking: Booking): number {
  const rate = HOURLY_RATES[booking.serviceId];
  if (rate === undefined) {
    throw new Error(`Unknown service: ${booking.serviceId}`);
  }
  return Math.round((rate * booking.durationMinutes) / 60);
}

export function depositAmount(booking: Booking): number {
  return Math.round(bookingPrice(booking) * 0.2);
}
