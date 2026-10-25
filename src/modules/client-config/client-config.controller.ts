import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { LIMITS } from '@/common/limits';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';
import { ClientConfigDto } from './client-config.dto';

@ApiTags('config')
@Controller('config')
export class ClientConfigController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @ZodSerializerDto(ClientConfigDto)
  @ApiOperation({ summary: 'Minimum app version, feature flags and product limits' })
  @ApiOkResponse({ type: ClientConfigDto })
  get(): ClientConfigDto {
    return {
      minSupportedAppVersion: this.config.MIN_APP_VERSION,
      flags: {},
      limits: { ...LIMITS },
    };
  }
}
