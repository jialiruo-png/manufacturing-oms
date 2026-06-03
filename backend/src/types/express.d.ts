import type { JwtUser } from '../lib/jwt';

type RequestUser = JwtUser & {
  managerSubRole: string;
  canApproveOrder: boolean;
  canManageUsers: boolean;
  isClerk: boolean;
  canCreateOrderForSales: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
