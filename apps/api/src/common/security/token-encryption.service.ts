import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('BOT_TOKEN_ENCRYPTION_KEY');
    if (!rawKey) {
      throw new Error('BOT_TOKEN_ENCRYPTION_KEY is required');
    }

    let key: Buffer;
    try {
      key = Buffer.from(rawKey, 'base64');
    } catch {
      throw new Error('BOT_TOKEN_ENCRYPTION_KEY must be base64-encoded 32-byte key');
    }

    if (key.length !== 32) {
      throw new Error('BOT_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }

    this.key = key;
  }

  encrypt(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(payload: { encrypted: string; iv: string; authTag: string }) {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.encrypted, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
