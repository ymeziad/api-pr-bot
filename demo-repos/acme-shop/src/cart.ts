import type { Cart } from "./types";

const COUPONS: Record<string, number> = {
  WELCOME10: 0.1,
  VIP25: 0.25,
};

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function cartTotal(cart: Cart): number {
  const discount = cart.couponCode ? COUPONS[cart.couponCode] ?? 0 : 0;
  return Math.round(subtotal(cart) * (1 - discount));
}
