import { ProjectOutput } from '../dto/project-usecase-dto';
import { UseCase } from '../usecase';

export type GetProjectsByOrganizationIdUseCase = UseCase<
  string,
  ProjectOutput[]
>;

export type GetProjectsByOrganizationSlugUseCase = UseCase<
  string,
  ProjectOutput[]
>;
