import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** @Body(new ZodPipe(schema)) — ZodError ProblemDetailsFilter'da 400 ga aylanadi. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
