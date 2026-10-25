import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { UsersModule } from '@/modules/users';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MeController } from './me.controller';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

const ISSUER = 'flinger';
const AUDIENCE = 'flinger-app';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE },
        verifyOptions: { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthRepository,
    OtpService,
    TokenService,
    AuthService,
    // Every route requires a valid session unless it is marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
