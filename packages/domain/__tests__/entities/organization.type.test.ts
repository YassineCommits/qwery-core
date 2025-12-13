import { describe, expect, it } from 'vitest';
import { OrganizationEntity } from '../../src/entities/organization.type';
import type { Organization } from '../../src/entities/organization.type';

describe('OrganizationEntity', () => {
  const createTestOrganization = (): Organization => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Organization',
    slug: 'test-org',
    userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: 'user-id',
    updatedBy: 'user-id',
  });

  describe('create', () => {
    it('should create a new organization entity', () => {
      const entity = OrganizationEntity.create({
        name: 'New Organization',
        userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        createdBy: 'user-id',
      });

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('New Organization');
      expect(entity.slug).toBeDefined();
      expect(entity.userId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    });
  });

  describe('update', () => {
    it('should update organization name', () => {
      const organization = createTestOrganization();
      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        name: 'Updated Name',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.userId).toBe(organization.userId);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        organization.updatedAt.getTime(),
      );
    });

    it('should update userId field', () => {
      const organization = createTestOrganization();
      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      });

      expect(updated.userId).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      expect(updated.name).toBe(organization.name);
    });

    it('should update updatedBy field', () => {
      const organization = createTestOrganization();
      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        updatedBy: 'new-user-id',
      });

      expect(updated.updatedBy).toBe('new-user-id');
    });

    it('should update multiple fields', () => {
      const organization = createTestOrganization();
      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        name: 'New Name',
        userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        updatedBy: 'new-user',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.userId).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      expect(updated.updatedBy).toBe('new-user');
    });

    it('should preserve unchanged fields', () => {
      const organization = createTestOrganization();
      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        name: 'Updated Name',
      });

      expect(updated.slug).toBe(organization.slug);
      expect(updated.createdBy).toBe(organization.createdBy);
      expect(updated.createdAt).toEqual(organization.createdAt);
    });

    it('should handle userId being updated', () => {
      const organization = createTestOrganization();
      expect(organization.userId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');

      const updated = OrganizationEntity.update(organization, {
        id: organization.id,
        userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      });

      expect(updated.userId).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
    });
  });
});
