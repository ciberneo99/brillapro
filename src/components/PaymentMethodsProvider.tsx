"use client";

import { createContext, useContext } from "react";
import type { PaymentMethod } from "@/modules/payment-methods/labels";

const Ctx = createContext<PaymentMethod[]>([]);

/** Hands the company's payment methods to client components (payment forms, history). */
export function PaymentMethodsProvider({ methods, children }: { methods: PaymentMethod[]; children: React.ReactNode }) {
  return <Ctx.Provider value={methods}>{children}</Ctx.Provider>;
}

export const usePaymentMethods = () => useContext(Ctx);
