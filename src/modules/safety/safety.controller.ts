import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
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
import {
  BlockDto,
  BlockedListDto,
  BlockedUserParamDto,
  ReportDto,
  ReportResultDto,
} from './dto/safety.dto';
import { SafetyService } from './safety.service';

@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('blocks')
  @HttpCode(204)
  @ApiOperation({ summary: 'Block someone (mutual; ends any match)' })
  @ApiNoContentResponse()
  async block(@CurrentUser() user: AuthUser, @Body() body: BlockDto): Promise<void> {
    await this.safety.block(user.id, body.userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unblock someone' })
  @ApiNoContentResponse()
  async unblock(
    @CurrentUser() user: AuthUser,
    @Param() params: BlockedUserParamDto,
  ): Promise<void> {
    await this.safety.unblock(user.id, params.userId);
  }

  @Get('blocks')
  @ZodSerializerDto(BlockedListDto)
  @ApiOperation({ summary: 'People I blocked' })
  @ApiOkResponse({ type: BlockedListDto })
  list(@CurrentUser() user: AuthUser): Promise<BlockedListDto> {
    return this.safety.listBlocked(user.id);
  }

  @Post('reports')
  @ZodSerializerDto(ReportResultDto)
  @ApiOperation({ summary: 'Report a person, photo, prompt or message (optionally block too)' })
  @ApiCreatedResponse({ type: ReportResultDto })
  report(@CurrentUser() user: AuthUser, @Body() body: ReportDto): Promise<ReportResultDto> {
    return this.safety.report(user.id, body);
  }
}
