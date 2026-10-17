export interface CartItem {
  sku: string;
  name: string;
  unitPrice: number; // in cents
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  currency: string;
  couponCode?: string;
}

export interface PaymentOutcome {
  ok: boolean;
  id: string;
}
