import { Injectable, PipeTransform } from '@nestjs/common';

export interface ParsedQuery {
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
  filter: Record<string, any>;
}

const ALLOWED_SORT_FIELDS = new Set([
  'createdAt', 'updatedAt', 'title', 'anchorText', 'targetUrl',
  'status', 'domain', 'name', 'expiresAt', 'lastSyncedAt', 'source',
]);

function sanitizeValue(value: any): string | undefined {
  if (typeof value === 'object' && value !== null) return undefined;
  return String(value);
}

@Injectable()
export class ParseQueryPipe implements PipeTransform {
  transform(query: Record<string, any>): ParsedQuery {
    const { _start, _end, _sort, _order, ...rest } = query;

    const start = parseInt(_start, 10) || 0;
    const end = parseInt(_end, 10) || 10;
    const limit = end - start;

    const sort: Record<string, 1 | -1> = {};
    if (_sort && typeof _sort === 'string' && ALLOWED_SORT_FIELDS.has(_sort)) {
      sort[_sort] = _order?.toUpperCase() === 'DESC' ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const filter: Record<string, any> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key.startsWith('_') || key.includes('$')) continue;
      const safe = sanitizeValue(value);
      if (safe === undefined) continue;

      if (key === 'id') {
        filter._id = safe;
      } else if (key === 'domains' && typeof value === 'string') {
        const domains = value
          .split(',')
          .map((d) => d.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .filter(Boolean);
        if (domains.length === 1) {
          filter.domain = { $regex: domains[0], $options: 'i' };
        } else if (domains.length > 1) {
          filter.domain = { $regex: domains.join('|'), $options: 'i' };
        }
        continue;
      } else if (key.endsWith('_gte')) {
        const field = key.replace('_gte', '');
        if (!field.includes('$')) {
          filter[field] = { ...filter[field], $gte: safe };
        }
      } else if (key.endsWith('_lte')) {
        const field = key.replace('_lte', '');
        if (!field.includes('$')) {
          filter[field] = { ...filter[field], $lte: safe };
        }
      } else if (key.endsWith('_ne')) {
        const field = key.replace('_ne', '');
        if (!field.includes('$')) {
          filter[field] = { $ne: safe };
        }
      } else if (key === 'q') {
        filter.$text = { $search: safe };
      } else {
        filter[key] = safe;
      }
    }

    return { skip: start, limit, sort, filter };
  }
}
