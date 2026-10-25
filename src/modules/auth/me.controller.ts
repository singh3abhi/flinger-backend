import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { NotFoundError } from '@/common/errors/domain-error';
import { MeDto, UsersService } from '@/modules/users';
import { AuthService } from './auth.service';

/**
 * GET /v1/me lives in the auth module because the email belongs to auth's identities;
 * the account itself is read through the users module's public API.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ZodSerializerDto(MeDto)
  @ApiOperation({ summary: 'The signed-in account' })
  @ApiOkResponse({ type: MeDto })
  async me(@CurrentUser() current: AuthUser): Promise<MeDto> {
    const user = await this.users.findById(current.id);
    if (!user) throw new NotFoundError('Account not found');
    return {
      id: user.id,
      status: user.status,
      email: (await this.auth.findEmail(user.id)) ?? null,
      // Finishing onboarding is what moves an account out of `pending`.
      onboardingCompleted: user.status !== 'pending',
      createdAt: user.createdAt.toISOString(),
    };
  }
}
