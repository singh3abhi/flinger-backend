import { Module } from '@nestjs/common';
import { UsersModule } from '@/modules/users';
import { PhotosController } from './photos.controller';
import { PhotosRepository } from './photos.repository';
import { PhotosService } from './photos.service';

/** Profile photos: upload slots, confirmation, order and removal. Bytes live in object storage. */
@Module({
  imports: [UsersModule],
  controllers: [PhotosController],
  providers: [PhotosRepository, PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}
