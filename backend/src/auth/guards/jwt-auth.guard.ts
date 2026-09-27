import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// ต้องแนบ header: Authorization: Bearer <accessToken>
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
