import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

// สมัครสมาชิกได้แค่ 2 role เท่านั้น (admin ต้องตั้งจากหลังบ้าน)
export const REGISTRABLE_ROLES = [UserRole.USER, UserRole.CREATOR] as const;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;

  @IsString()
  @Length(1, 150)
  displayName!: string;

  @IsOptional()
  @IsIn(REGISTRABLE_ROLES)
  role?: (typeof REGISTRABLE_ROLES)[number];
}
