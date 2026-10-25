import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  AuthResultDto,
  RefreshDto,
  RequestOtpDto,
  RequestOtpResultDto,
  TokensDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ZodSerializerDto(RequestOtpResultDto)
  @ApiOperation({ summary: 'Email a 6-digit sign-in code' })
  @ApiOkResponse({ type: RequestOtpResultDto })
  requestOtp(@Body() body: RequestOtpDto, @Ip() ip: string): Promise<RequestOtpResultDto> {
    return this.auth.requestOtp(body.email, ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ZodSerializerDto(AuthResultDto)
  @ApiOperation({ summary: 'Check the code and sign in (creates the account on first sign-in)' })
  @ApiOkResponse({ type: AuthResultDto })
  verifyOtp(@Body() body: VerifyOtpDto, @Ip() ip: string): Promise<AuthResultDto> {
    return this.auth.verifyOtp(body, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ZodSerializerDto(TokensDto)
  @ApiOperation({ summary: 'Swap a refresh token for a new pair (the old one stops working)' })
  @ApiOkResponse({ type: TokensDto })
  refresh(@Body() body: RefreshDto): Promise<TokensDto> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out this device' })
  @ApiNoContentResponse()
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.sessionId);
  }
}
