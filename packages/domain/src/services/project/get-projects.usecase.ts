import { Code } from '../../common/code';
import { DomainException } from '../../exceptions';
import {
  IProjectRepository,
  IOrganizationRepository,
} from '../../repositories';
import {
  GetProjectsByOrganizationIdUseCase,
  GetProjectsByOrganizationSlugUseCase,
  ProjectOutput,
} from '../../usecases';

export class GetProjectsByOrganizationIdService
  implements GetProjectsByOrganizationIdUseCase
{
  constructor(private readonly projectRepository: IProjectRepository) {}

  public async execute(orgId: string): Promise<ProjectOutput[]> {
    const projects =
      await this.projectRepository.findAllByOrganizationId(orgId);
    return projects.map((project) => ProjectOutput.new(project));
  }
}

export class GetProjectsByOrganizationSlugService
  implements GetProjectsByOrganizationSlugUseCase
{
  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly organizationRepository: IOrganizationRepository,
  ) {}

  public async execute(slug: string): Promise<ProjectOutput[]> {
    const organization = await this.organizationRepository.findBySlug(slug);
    if (!organization) {
      throw DomainException.new({
        code: Code.ORGANIZATION_NOT_FOUND_ERROR,
        overrideMessage: `Organization with slug '${slug}' not found`,
        data: { organizationSlug: slug },
      });
    }

    const projects = await this.projectRepository.findAllByOrganizationId(
      organization.id,
    );
    return projects.map((project) => ProjectOutput.new(project));
  }
}
