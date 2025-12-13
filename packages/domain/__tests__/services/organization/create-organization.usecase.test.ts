import { describe, expect, it } from 'vitest';
import type { Organization } from '../../../src/entities/organization.type';
import { IOrganizationRepository } from '../../../src/repositories/organization-repository.port';
import { CreateOrganizationService } from '../../../src/services/organization/create-organization.usecase';

class MockOrganizationRepository implements IOrganizationRepository {
  private organizations = new Map<string, Organization>();

  async findAll() {
    return Array.from(this.organizations.values());
  }

  async findById(id: string) {
    return this.organizations.get(id) ?? null;
  }

  async findBySlug(slug: string) {
    const orgs = Array.from(this.organizations.values());
    return orgs.find((org) => org.slug === slug) ?? null;
  }

  async create(entity: Organization) {
    this.organizations.set(entity.id, entity);
    return entity;
  }

  async update(entity: Organization) {
    if (!this.organizations.has(entity.id)) {
      throw new Error(`Organization with id ${entity.id} not found`);
    }
    this.organizations.set(entity.id, entity);
    return entity;
  }

  async delete(id: string) {
    return this.organizations.delete(id);
  }

  shortenId(id: string) {
    return id.slice(0, 8);
  }
}

describe('CreateOrganizationService', () => {
  it('should create a new organization', async () => {
    const repository = new MockOrganizationRepository();
    const service = new CreateOrganizationService(repository);

    const result = await service.execute({
      name: 'Test Organization',
      userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      createdBy: 'user-id',
    });

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Organization');
    expect(result.userId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(result.slug).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('should generate unique ids for different organizations', async () => {
    const repository = new MockOrganizationRepository();
    const service = new CreateOrganizationService(repository);

    const result1 = await service.execute({
      name: 'Organization 1',
      userId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      createdBy: 'user-id',
    });

    const result2 = await service.execute({
      name: 'Organization 2',
      userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      createdBy: 'user-id',
    });

    expect(result1.id).not.toBe(result2.id);
    expect(result1.slug).not.toBe(result2.slug);
  });
});
