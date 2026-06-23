import { Injectable, PipeTransform } from '@nestjs/common';

export interface ParsedQuery {
  skip: number;
  limit: number;
  sort: Record<string, 1 | -1>;
  filter: Record<string, any>;
}

@Injectable()
export class ParseQueryPipe implements PipeTransform {
  transform(query: Record<string, any>): ParsedQuery {
    const { _start, _end, _sort, _order, ...rest } = query;

    const start = parseInt(_start, 10) || 0;
    const end = parseInt(_end, 10) || 10;
    const limit = end - start;

    const sort: Record<string, 1 | -1> = {};
    if (_sort) {
      sort[_sort] = _order?.toUpperCase() === 'DESC' ? -1 : 1;
    } else {
      sort.createdAt = -1;
    }

    const filter: Record<string, any> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (key.startsWith('_')) continue;
      if (key === 'id') {
        filter._id = value;
      } else if (key === 'domains' && typeof value === 'string') {
        const domains = value
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);
        if (domains.length) {
          filter.domain = { $in: domains };
        }
        continue;
      } else if (key.endsWith('_gte')) {
        filter[key.replace('_gte', '')] = { ...filter[key.replace('_gte', '')], $gte: value };
      } else if (key.endsWith('_lte')) {
        filter[key.replace('_lte', '')] = { ...filter[key.replace('_lte', '')], $lte: value };
      } else if (key.endsWith('_ne')) {
        filter[key.replace('_ne', '')] = { $ne: value };
      } else if (key === 'q') {
        filter.$text = { $search: value };
      } else {
        filter[key] = value;
      }
    }

    return { skip: start, limit, sort, filter };
  }
}
