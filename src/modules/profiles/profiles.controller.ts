import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import {
  AcceptConsentsDto,
  MyProfileDto,
  PromptListDto,
  SetLocationDto,
  SetLocationResultDto,
  SetPromptsDto,
  UpdateProfileDto,
} from './dto/profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('me')
export class MyProfileController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('profile')
  @ZodSerializerDto(MyProfileDto)
  @ApiOperation({ summary: 'My profile and onboarding progress (where to resume)' })
  @ApiOkResponse({ type: MyProfileDto })
  get(@CurrentUser() user: AuthUser): Promise<MyProfileDto> {
    return this.profiles.getOwn(user.id);
  }

  @Patch('profile')
  @ZodSerializerDto(MyProfileDto)
  @ApiOperation({ summary: 'Save onboarding answers (send only what changed)' })
  @ApiOkResponse({ type: MyProfileDto })
  update(@CurrentUser() user: AuthUser, @Body() body: UpdateProfileDto): Promise<MyProfileDto> {
    return this.profiles.update(user.id, body);
  }

  @Put('prompts')
  @ZodSerializerDto(MyProfileDto)
  @ApiOperation({ summary: 'Set my prompt answers, in display order (up to 3)' })
  @ApiOkResponse({ type: MyProfileDto })
  setPrompts(@CurrentUser() user: AuthUser, @Body() body: SetPromptsDto): Promise<MyProfileDto> {
    return this.profiles.setPrompts(user.id, body.prompts);
  }

  @Put('location')
  @ZodSerializerDto(SetLocationResultDto)
  @ApiOperation({ summary: 'Save my GPS location (no manual city); returns the city label' })
  @ApiOkResponse({ type: SetLocationResultDto })
  setLocation(
    @CurrentUser() user: AuthUser,
    @Body() body: SetLocationDto,
  ): Promise<SetLocationResultDto> {
    return this.profiles.setLocation(user.id, body);
  }

  @Post('consents')
  @HttpCode(204)
  @ApiOperation({ summary: 'Accept the Terms, Privacy Policy and Community Guidelines' })
  @ApiNoContentResponse()
  async acceptConsents(
    @CurrentUser() user: AuthUser,
    @Body() body: AcceptConsentsDto,
  ): Promise<void> {
    await this.profiles.acceptConsents(user.id, body.documents, body.version);
  }
}

@ApiTags('profile')
@ApiBearerAuth()
@Controller('prompts')
export class PromptsController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ZodSerializerDto(PromptListDto)
  @ApiOperation({ summary: 'The prompt library' })
  @ApiOkResponse({ type: PromptListDto })
  async list(): Promise<PromptListDto> {
    return { items: await this.profiles.listPrompts() };
  }
}
