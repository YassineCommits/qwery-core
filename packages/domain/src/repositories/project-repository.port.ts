import { Project } from '../entities';
import { RepositoryPort } from './base-repository.port';

export abstract class IProjectRepository extends RepositoryPort<
  Project,
  string
> {
  public abstract findAllByOrganizationId(orgId: string): Promise<Project[]>;
}
