import type { ROLES, ORDER_STATUSES } from "./constants";

export type Role = (typeof ROLES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role: Role;
  branchId: string | null;
};

export type LoginResponse = {
  access_token: string;
  user: AuthUser;
};
