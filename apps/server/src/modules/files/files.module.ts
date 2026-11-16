import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { attachSchema, type AttachInput, entityTypeEnum, folderCreateSchema, folderRenameSchema, listQuerySchema } from '@ads/contracts';
import { Auth, RequirePermissions } from '../../platform/auth/decorators.js';
import type { AuthContext } from '../../platform/auth/auth.types.js';
import { INLINE_SAFE } from '../../platform/mime.js';
import { StorageService } from '../../platform/storage.service.js';
import { ZodPipe } from '../../platform/zod.pipe.js';
import { FilesService } from './files.service.js';

const filesQuery = listQuerySchema.extend({
  folderId: z.union([z.uuid(), z.literal('root')]).optional(),
  entityType: entityTypeEnum.optional(),
  entityId: z.uuid().optional(),
});
const dlQuery = z.object({ inline: z.enum(['0', '1']).optional() });
const id = new ParseUUIDPipe();
const contentDisposition = (type: 'inline' | 'attachment', name: string) =>
  `${type}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Get() @RequirePermissions('files:read')
  list(@Query(new ZodPipe(filesQuery)) q: z.infer<typeof filesQuery>) { return this.svc.list(q); }

  @Get(':id/versions') @RequirePermissions('files:read')
  versions(@Param('id', id) fid: string) { return this.svc.versions(fid); }

  @Post() @RequirePermissions('files:upload')
  upload(@Req() req: FastifyRequest, @Auth() a: AuthContext) { return this.svc.upload(req, a); }

  @Get(':id/download') @RequirePermissions('files:read')
  async download(@Param('id', id) fid: string, @Query(new ZodPipe(dlQuery)) q: z.infer<typeof dlQuery>, @Res() reply: FastifyReply) {
    const { file, stream } = await this.svc.openForDownload(fid);
    const inline = q.inline === '1' && INLINE_SAFE.has(file.mimeType);
    return reply
      .header('content-type', file.mimeType)
      .header('content-length', file.sizeBytes.toString())
      .header('content-disposition', contentDisposition(inline ? 'inline' : 'attachment', file.originalName))
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
      .send(stream);
  }

  @Delete(':id') @RequirePermissions('files:delete')
  remove(@Param('id', id) fid: string) { return this.svc.remove(fid); }

  @Post(':id/attachments') @RequirePermissions('files:upload')
  attach(@Param('id', id) fid: string, @Body(new ZodPipe(attachSchema)) b: AttachInput, @Auth() a: AuthContext) { return this.svc.attach(fid, b, a); }

  @Delete('attachments/:attachmentId') @RequirePermissions('files:upload')
  detach(@Param('attachmentId', id) aid: string) { return this.svc.detach(aid); }
}

@Controller('folders')
export class FoldersController {
  constructor(private readonly svc: FilesService) {}

  @Get() @RequirePermissions('files:read')
  list(@Query(new ZodPipe(z.object({ parentId: z.uuid().optional() }))) q: { parentId?: string }) { return this.svc.folders(q.parentId ?? null); }

  @Post() @RequirePermissions('files:upload')
  create(@Body(new ZodPipe(folderCreateSchema)) b: z.infer<typeof folderCreateSchema>) { return this.svc.createFolder(b.name, b.parentId); }

  @Patch(':id') @RequirePermissions('files:upload')
  rename(@Param('id', id) fid: string, @Body(new ZodPipe(folderRenameSchema)) b: { name: string }) { return this.svc.renameFolder(fid, b.name); }

  @Delete(':id') @RequirePermissions('files:delete')
  remove(@Param('id', id) fid: string) { return this.svc.removeFolder(fid); }
}

@Module({ controllers: [FilesController, FoldersController], providers: [FilesService, StorageService], exports: [FilesService, StorageService] })
export class FilesModule {}
