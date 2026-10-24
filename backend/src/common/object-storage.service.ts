import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { Readable } from 'stream';

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const secretKey = this.configService.get<string>('S3_SECRET_KEY');
    this.bucket = this.configService.get<string>('S3_BUCKET') ?? '';
    this.client =
      endpoint && accessKey && secretKey && this.bucket
        ? new S3Client({
            region: this.configService.get<string>('S3_REGION') ?? 'us-east-1',
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
          })
        : null;
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        this.logger.warn(
          `Recording bucket is not ready: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  async saveUpload(file: Express.Multer.File, key: string) {
    if (!this.client || !file.path) return file.path;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(file.path),
          ContentType: file.mimetype || 'application/octet-stream',
          ContentLength: file.size,
        }),
      );
      await unlink(file.path).catch(() => undefined);
      return `s3:${key}`;
    } catch (error) {
      this.logger.warn(
        `Recording stayed on local disk: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return file.path;
    }
  }

  async open(storagePath: string): Promise<Readable | null> {
    if (storagePath.startsWith('s3:')) {
      if (!this.client) return null;
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: storagePath.slice(3),
        }),
      );
      const body = result.Body;
      if (!body) return null;
      return body as Readable;
    }

    if (!existsSync(storagePath)) return null;
    return createReadStream(storagePath);
  }
}
