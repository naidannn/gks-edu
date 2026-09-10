import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../prisma/client.js';
import { VectorController } from './vector.controller.js';

/**
 * 1N-02 — the knowledge base carried nothing but bearer auth, which made every
 * stored document readable by any client with a login and the write side an
 * open channel for putting words into the phase-2 assistant's mouth.
 *
 * The controller-level `@Roles` is what closes it, so this asserts the metadata
 * rather than driving HTTP: a method that quietly loses the class decorator is
 * the way this comes back.
 */
describe('VectorController access (1N-02)', () => {
  const reflector = new Reflector();

  it('is admin-only for the whole controller', () => {
    expect(reflector.get<Role[]>(ROLES_KEY, VectorController)).toEqual([Role.ADMIN]);
  });

  it('leaves no route open to a lesser role — reads included', () => {
    const routes = ['create', 'search', 'findAll', 'findOne', 'remove'] as const;

    for (const route of routes) {
      const roles = reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        VectorController.prototype[route],
        VectorController,
      ]);
      expect(roles, route).toEqual([Role.ADMIN]);
    }
  });
});
