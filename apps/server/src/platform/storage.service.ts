import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { storageRoot } from '../config/env.js';

export interface StoredObject { key: string; size: bigint; sha256: string; head: Buffer }

/** Lokal disk adapteri (v1). S3-compatible adapter keyin shu interfeys bilan qo'shiladi. */
@Injectable()
export class StorageService {
  readonly bucket = 'local';
  private readonly root = path.resolve(storageRoot);

  private abs(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('invalid storage key');
    return p;
  }

  /** Oqimni diskka yozadi (avval .part, keyin atomik rename), SHA-256 va boshidagi baytlarni hisoblaydi. */
  async put(stream: Readable): Promise<StoredObject> {
    const now = new Date();
    const key = `f/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`;
    const file = this.abs(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.part`;
    const hash = createHash('sha256');
    let size = 0;
    let head = Buffer.alloc(0);
    const tap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        hash.update(chunk);
        if (head.length < 4096) head = Buffer.concat([head, chunk.subarray(0, 4096 - head.length)]);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(stream, tap, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
      await rename(tmp, file);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    return { key, size: BigInt(size), sha256: hash.digest('hex'), head };
  }

  read(key: string): Readable {
    return createReadStream(this.abs(key));
  }

  async remove(key: string) {
    await rm(this.abs(key), { force: true });
  }
}
