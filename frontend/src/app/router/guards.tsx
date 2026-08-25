import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { useAuth, type Role } from '@/providers/AuthProvider';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to={ROUTES.LOGIN} replace />;
}

const roleHome: Partial<Record<Role, string>> = {
  admin: ROUTES.ADMIN,
  'it-head': ROUTES.IT_HEAD,
  guardian: ROUTES.GUARDIAN,
};

// Navigating imperatively right after an auth-state change (e.g. from Register's onSubmit)
// races this component's own redirect and loses — see Login.tsx's comment on the same issue.
// So callers that need to land somewhere other than the default role home (registerAccount's
// Payment redirect) hand that target to us via postAuthRedirect instead of calling navigate().
// postAuthRedirect is cleared by the destination page itself (see PaymentPage), not here —
// clearing it while this component is still mounted would change <Navigate>'s target mid-flight
// and redirect a second time.
export function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, role, postAuthRedirect } = useAuth();
  if (!isAuthenticated) return children;
  return <Navigate to={postAuthRedirect ?? (role && roleHome[role]) ?? ROUTES.DASHBOARD} replace />;
}

export function RoleRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to={ROUTES.LOGIN} replace />;
  if (!role || !allow.includes(role)) return <Navigate to={ROUTES.DASHBOARD} replace />;
  return children;
}
