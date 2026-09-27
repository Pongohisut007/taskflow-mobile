import type { UserRole } from '../../users/entities/user.entity';

export interface JwtPayload {
  // user id
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: string;
  user: AuthUser;
}
