import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser, type AuthUser } from '@/common/decorators/current-user.decorator';
import { PageQueryDto } from '@/modules/matching';
import { ChatService } from './chat.service';
import {
  ConversationIdParamDto,
  ConversationListDto,
  MarkReadDto,
  MessageDto,
  MessagePageDto,
  MessagePageQueryDto,
  SendMessageDto,
} from './dto/chat.dto';

/** REST side of chat: lists, history, gap-fill, and sending when the socket is down. */
@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ZodSerializerDto(ConversationListDto)
  @ApiOperation({ summary: 'My conversations (one per match), most recent first' })
  @ApiOkResponse({ type: ConversationListDto })
  list(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto): Promise<ConversationListDto> {
    return this.chat.list(user.id, query.limit, query.cursor);
  }

  @Get(':conversationId/messages')
  @ZodSerializerDto(MessagePageDto)
  @ApiOperation({
    summary: 'Messages, oldest first: newest page, older with `before`, gap-fill with `after`',
  })
  @ApiOkResponse({ type: MessagePageDto })
  messages(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationIdParamDto,
    @Query() query: MessagePageQueryDto,
  ): Promise<MessagePageDto> {
    return this.chat.messages(user.id, params.conversationId, query);
  }

  @Post(':conversationId/messages')
  @HttpCode(200)
  @ZodSerializerDto(MessageDto)
  @ApiOperation({ summary: 'Send a message (idempotent by clientMsgId)' })
  @ApiOkResponse({ type: MessageDto })
  send(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationIdParamDto,
    @Body() body: SendMessageDto,
  ): Promise<MessageDto> {
    return this.chat.send(user.id, params.conversationId, body.clientMsgId, body.body);
  }

  @Post(':conversationId/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark the conversation read up to a message' })
  @ApiNoContentResponse()
  async read(
    @CurrentUser() user: AuthUser,
    @Param() params: ConversationIdParamDto,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.chat.markRead(user.id, params.conversationId, body.upToMessageId);
  }
}
