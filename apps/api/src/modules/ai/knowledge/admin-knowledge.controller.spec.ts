import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator.js';
import { AccessLevel, Role } from '../../../prisma/client.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import type { IngestService } from './ingest.service.js';
import type { KnowledgeService } from './knowledge.service.js';
import type { RetrievalService } from './retrieval.service.js';
import type { StorageService } from '../../../storage/storage.service.js';
import { AdminKnowledgeController } from './admin-knowledge.controller.js';

/**
 * 2E-01 — who may read and who may write.
 *
 * The split is the point: a consultant works this screen daily, and the write
 * side is the channel that puts words into the assistant's mouth. A route that
 * quietly loses its `@Roles(ADMIN)` is how that channel opens, so the metadata
 * is asserted rather than driven through HTTP.
 */
describe('AdminKnowledgeController access (2E-01)', () => {
  const reflector = new Reflector();

  const rolesFor = (method: keyof AdminKnowledgeController) =>
    reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      AdminKnowledgeController.prototype[method] as never,
      AdminKnowledgeController,
    ]);

  it('lets any CRM staff member read', () => {
    for (const route of ['list', 'findOne', 'searchTest'] as const) {
      expect(rolesFor(route), route).toEqual([Role.ADMIN, Role.CONSULTANT]);
    }
  });

  it('keeps every write admin-only', () => {
    for (const route of ['create', 'upload', 'update', 'remove', 'reindex', 'reindexPending'] as const) {
      expect(rolesFor(route), route).toEqual([Role.ADMIN]);
    }
  });
});

describe('search test ceiling', () => {
  function controller() {
    const retrieval = { search: vi.fn().mockResolvedValue([]) } as unknown as RetrievalService;
    const instance = new AdminKnowledgeController(
      {} as KnowledgeService,
      {} as IngestService,
      {} as StorageService,
      retrieval,
    );
    return { instance, retrieval };
  }

  const staff = (role: Role): AuthenticatedUser => ({ id: 'u1', email: null, role });

  it('lets an admin probe at any level, INTERNAL included', async () => {
    const { instance, retrieval } = controller();

    await instance.searchTest({ query: 'комисс', accessLevel: AccessLevel.INTERNAL }, staff(Role.ADMIN));

    expect(retrieval.search).toHaveBeenCalledWith(expect.objectContaining({ level: AccessLevel.INTERNAL }));
  });

  it('caps a consultant at CONTRACTED even when they ask for INTERNAL', async () => {
    const { instance, retrieval } = controller();

    await instance.searchTest({ query: 'комисс', accessLevel: AccessLevel.INTERNAL }, staff(Role.CONSULTANT));

    // Otherwise the "test the search" box would hand back the very text the
    // list hides from them.
    expect(retrieval.search).toHaveBeenCalledWith(expect.objectContaining({ level: AccessLevel.CONTRACTED }));
  });

  it('honours a lower level anybody asks for — that is the point of the box', async () => {
    const { instance, retrieval } = controller();

    await instance.searchTest({ query: 'дотуур байр', accessLevel: AccessLevel.PUBLIC }, staff(Role.CONSULTANT));

    expect(retrieval.search).toHaveBeenCalledWith(expect.objectContaining({ level: AccessLevel.PUBLIC }));
  });
});
