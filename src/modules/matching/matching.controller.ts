import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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
  LikeDto,
  LikeResultDto,
  LimitsDto,
  MatchIdParamDto,
  MatchListDto,
  PageQueryDto,
  PassDto,
  ReceivedLikesDto,
} from './dto/matching.dto';
import { MatchingService } from './matching.service';

@ApiTags('matching')
@ApiBearerAuth()
@Controller()
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('likes')
  @HttpCode(200)
  @ZodSerializerDto(LikeResultDto)
  @ApiOperation({ summary: 'Like someone via one photo or prompt, with an optional comment' })
  @ApiOkResponse({ type: LikeResultDto })
  like(@CurrentUser() user: AuthUser, @Body() body: LikeDto): Promise<LikeResultDto> {
    return this.matching.like(user.id, body);
  }

  @Post('passes')
  @HttpCode(204)
  @ApiOperation({ summary: 'Pass on someone' })
  @ApiNoContentResponse()
  async pass(@CurrentUser() user: AuthUser, @Body() body: PassDto): Promise<void> {
    await this.matching.pass(user.id, body.targetId);
  }

  @Get('me/limits')
  @ZodSerializerDto(LimitsDto)
  @ApiOperation({ summary: 'Likes left today and when they refill' })
  @ApiOkResponse({ type: LimitsDto })
  limits(@CurrentUser() user: AuthUser): Promise<LimitsDto> {
    return this.matching.limits(user.id);
  }

  @Get('likes/received')
  @ZodSerializerDto(ReceivedLikesDto)
  @ApiOperation({ summary: 'Liked You: who liked me, on what, with their comment' })
  @ApiOkResponse({ type: ReceivedLikesDto })
  received(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<ReceivedLikesDto> {
    return this.matching.likesReceived(user.id, query.limit, query.cursor);
  }

  @Get('matches')
  @ZodSerializerDto(MatchListDto)
  @ApiOperation({ summary: 'My matches, newest first' })
  @ApiOkResponse({ type: MatchListDto })
  matches(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<MatchListDto> {
    return this.matching.matches(user.id, query.limit, query.cursor);
  }

  @Delete('matches/:matchId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unmatch (for both people, permanently)' })
  @ApiNoContentResponse()
  async unmatch(@CurrentUser() user: AuthUser, @Param() params: MatchIdParamDto): Promise<void> {
    await this.matching.unmatch(user.id, params.matchId);
  }
}
