import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyDocument } from './schemas/api-key.schema';
import { ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
  ) {}

  async findAll(query: ParsedQuery) {
    const [data, total] = await Promise.all([
      this.apiKeyModel
        .find(query.filter)
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.apiKeyModel.countDocuments(query.filter).exec(),
    ]);
    return { data, total };
  }

  async create(name: string, rateLimit = 60) {
    const rawKey = 'vscms_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(6, 14);
    const hmacSecret = crypto.randomBytes(32).toString('hex');

    const apiKey = await this.apiKeyModel.create({
      name,
      keyHash,
      keyPrefix,
      hmacSecret,
      rateLimit,
    });

    return {
      _id: apiKey._id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      rawKey,
      rawHmacSecret: hmacSecret,
    };
  }

  async validateKey(rawKey: string): Promise<ApiKeyDocument | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeyModel.findOne({ keyHash, isActive: true });
    if (apiKey) {
      await this.apiKeyModel.findByIdAndUpdate(apiKey._id, { lastUsedAt: new Date() });
    }
    return apiKey;
  }

  async validateHmac(apiKey: ApiKeyDocument, body: string, timestamp: string, signature: string): Promise<boolean> {
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) return false;

    const expected = crypto
      .createHmac('sha256', apiKey.hmacSecret)
      .update(body + timestamp)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  }

  async deactivate(id: string) {
    const key = await this.apiKeyModel.findByIdAndUpdate(id, { isActive: false }, { new: true });
    return key?.toJSON();
  }

  async delete(id: string) {
    return this.apiKeyModel.findByIdAndDelete(id);
  }
}
