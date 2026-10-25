import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { PublicProfileDto } from '@/modules/profiles';
import { DeckDto, DeckQueryDto, UserIdParamDto } from './dto/discovery.dto';
import { DiscoveryService } from './discovery.service';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('discovery/deck')
  @ZodSerializerDto(DeckDto)
  @ApiOperation({ summary: 'The next Discover cards (refills and re-checks automatically)' })
  @ApiOkResponse({ type: DeckDto })
  deck(@CurrentUser() user: AuthUser, @Query() query: DeckQueryDto): Promise<DeckDto> {
    return this.discovery.nextCards(user.id, query.limit);
  }

  @Get('profiles/:userId')
  @ZodSerializerDto(PublicProfileDto)
  @ApiOperation({ summary: 'A member’s full profile (only people from my deck, likes or matches)' })
  @ApiOkResponse({ type: PublicProfileDto })
  profile(
    @CurrentUser() user: AuthUser,
    @Param() params: UserIdParamDto,
  ): Promise<PublicProfileDto> {
    return this.discovery.profile(user.id, params.userId);
  }
}
