import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { SettingsDto, SettingsService, UpdateSettingsDto } from '@/modules/settings';
import { AccountService } from './account.service';
import { DeleteAccountDto, ExportDto, ExportIdParamDto } from './dto/account.dto';

/** The member's own account: settings, pause, and (below) deleting and exporting. */
@ApiTags('account')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(
    private readonly settings: SettingsService,
    private readonly account: AccountService,
  ) {}

  @Get('settings')
  @ZodSerializerDto(SettingsDto)
  @ApiOperation({ summary: 'My settings (read receipts, notifications)' })
  @ApiOkResponse({ type: SettingsDto })
  getSettings(@CurrentUser() user: AuthUser): Promise<SettingsDto> {
    return this.settings.get(user.id);
  }

  @Patch('settings')
  @ZodSerializerDto(SettingsDto)
  @ApiOperation({ summary: 'Change settings (send only what changed)' })
  @ApiOkResponse({ type: SettingsDto })
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateSettingsDto,
  ): Promise<SettingsDto> {
    return this.settings.update(user.id, body);
  }

  @Post('pause')
  @HttpCode(204)
  @ApiOperation({ summary: 'Pause: hide my profile from everyone (chats stay)' })
  @ApiNoContentResponse()
  async pause(@CurrentUser() user: AuthUser): Promise<void> {
    await this.account.pause(user.id);
  }

  @Delete('pause')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unpause: show my profile again' })
  @ApiNoContentResponse()
  async unpause(@CurrentUser() user: AuthUser): Promise<void> {
    await this.account.unpause(user.id);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my account (type DELETE to confirm); erased after 30 days' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Body() body: DeleteAccountDto): Promise<void> {
    await this.account.delete(user.id, body.confirm);
  }

  @Post('export')
  @ZodSerializerDto(ExportDto)
  @ApiOperation({ summary: 'Download my data: builds a JSON file and returns a link' })
  @ApiCreatedResponse({ type: ExportDto })
  requestExport(@CurrentUser() user: AuthUser): Promise<ExportDto> {
    return this.account.requestExport(user.id);
  }

  @Get('export/:exportId')
  @ZodSerializerDto(ExportDto)
  @ApiOperation({ summary: 'An export and its download link' })
  @ApiOkResponse({ type: ExportDto })
  getExport(@CurrentUser() user: AuthUser, @Param() params: ExportIdParamDto): Promise<ExportDto> {
    return this.account.getExport(user.id, params.exportId);
  }
}
