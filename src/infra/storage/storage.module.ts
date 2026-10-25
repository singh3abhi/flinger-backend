import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * Private object storage for photos, behind an interface so the vendor can change (SeaweedFS
 * locally, Amazon S3 in AWS). Clients never get bucket credentials: they upload and download with
 * short-lived presigned URLs.
 */
export interface ObjectStorage {
  /** URL the device PUTs the bytes to. `Content-Type` must be sent exactly as given. */
  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;
  /** Size and type of an uploaded object, or null if it does not exist. */
  head(key: string): Promise<StoredObject | null>;
  /** The first `bytes` bytes of an object (to check what the file really is). */
  readStart(key: string, bytes: number): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

function clientConfig(config: AppConfig, endpoint: string | undefined): S3ClientConfig {
  return {
    region: config.S3_REGION,
    endpoint,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials:
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
        : undefined,
    // Without this the SDK signs a CRC32 of an empty body into presigned PUT URLs, and every
    // device upload fails with BadDigest (on S3 and SeaweedFS alike).
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}

@Injectable()
export class S3ObjectStorage implements ObjectStorage, OnApplicationBootstrap {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly s3: S3Client;
  /** Signs URLs for the host devices can reach (differs from the server's host locally). */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.bucket = config.S3_BUCKET;
    this.s3 = new S3Client(clientConfig(config, config.S3_ENDPOINT));
    this.signer = new S3Client(
      clientConfig(config, config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT),
    );
  }

  /** Local development only: create the bucket so `docker compose up` is all you need. */
  async onApplicationBootstrap(): Promise<void> {
    if (this.config.APP_ENV !== 'local' || !this.config.S3_ENDPOINT) return;
    try {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created local bucket ${this.bucket}`);
    } catch (error) {
      const name = error instanceof S3ServiceException ? error.name : '';
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
        this.logger.warn(`Could not create local bucket ${this.bucket}: ${String(error)}`);
      }
    }
  }

  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      // Signing Content-Type means the upload must declare the type we approved.
      { expiresIn: expiresInSeconds, signableHeaders: new Set(['content-type']) },
    );
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound')
        return null;
      throw error;
    }
  }

  async readStart(key: string, bytes: number): Promise<Buffer> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    const body = await result.Body?.transformToByteArray();
    return Buffer.from(body ?? []);
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

@Global()
@Module({
  providers: [{ provide: OBJECT_STORAGE, useClass: S3ObjectStorage }],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
