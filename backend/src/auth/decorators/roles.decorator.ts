import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

// ตัวอย่าง: @Roles(UserRole.CREATOR)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
