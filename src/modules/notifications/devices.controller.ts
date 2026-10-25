import { Body, Controller, Delete, HttpCode, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { DevicesRepository } from './devices.repository';
import { DeviceIdParamDto, PushTokenDto } from './dto/devices.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesRepository) {}

  @Put(':deviceId/push-token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register this install’s push token' })
  @ApiNoContentResponse()
  async register(
    @CurrentUser() user: AuthUser,
    @Param() params: DeviceIdParamDto,
    @Body() body: PushTokenDto,
  ): Promise<void> {
    await this.devices.saveToken({
      userId: user.id,
      deviceId: params.deviceId,
      platform: body.platform,
      pushProvider: body.provider,
      pushToken: body.token,
    });
  }

  @Delete(':deviceId/push-token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop pushes to this install (call on sign-out)' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Param() params: DeviceIdParamDto): Promise<void> {
    await this.devices.removeDevice(user.id, params.deviceId);
  }
}
