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
import {
  CompletePhotoDto,
  CreatePhotoDto,
  PhotoDto,
  PhotoIdParamDto,
  PhotoListDto,
  PhotoUploadDto,
  ReorderPhotosDto,
} from './dto/photo.dto';
import { PhotosService } from './photos.service';

/**
 * Upload flow: POST /me/photos (reserve a slot, get an upload URL) → PUT the bytes to that URL →
 * POST /me/photos/{id}/complete. Photo bytes never pass through the API.
 */
@ApiTags('photos')
@ApiBearerAuth()
@Controller('me/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  @ZodSerializerDto(PhotoListDto)
  @ApiOperation({ summary: 'My photos in order (first = main)' })
  @ApiOkResponse({ type: PhotoListDto })
  async list(@CurrentUser() user: AuthUser): Promise<PhotoListDto> {
    return { items: await this.photos.listOwn(user.id) };
  }

  @Post()
  @ZodSerializerDto(PhotoUploadDto)
  @ApiOperation({ summary: 'Reserve a photo slot and get a short-lived upload URL' })
  @ApiCreatedResponse({ type: PhotoUploadDto })
  reserve(@CurrentUser() user: AuthUser, @Body() body: CreatePhotoDto): Promise<PhotoUploadDto> {
    return this.photos.reserve(user.id, body);
  }

  @Post(':photoId/complete')
  @HttpCode(200)
  @ZodSerializerDto(PhotoDto)
  @ApiOperation({ summary: 'Confirm the upload finished; the photo goes to review' })
  @ApiOkResponse({ type: PhotoDto })
  complete(
    @CurrentUser() user: AuthUser,
    @Param() params: PhotoIdParamDto,
    @Body() body: CompletePhotoDto,
  ): Promise<PhotoDto> {
    return this.photos.complete(user.id, params.photoId, body);
  }

  @Patch('order')
  @ZodSerializerDto(PhotoListDto)
  @ApiOperation({ summary: 'Reorder my photos (first = main)' })
  @ApiOkResponse({ type: PhotoListDto })
  async reorder(
    @CurrentUser() user: AuthUser,
    @Body() body: ReorderPhotosDto,
  ): Promise<PhotoListDto> {
    return { items: await this.photos.reorder(user.id, body.photoIds) };
  }

  @Delete(':photoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a photo (a finished profile keeps at least 4)' })
  @ApiNoContentResponse()
  async remove(@CurrentUser() user: AuthUser, @Param() params: PhotoIdParamDto): Promise<void> {
    await this.photos.remove(user.id, params.photoId);
  }
}
