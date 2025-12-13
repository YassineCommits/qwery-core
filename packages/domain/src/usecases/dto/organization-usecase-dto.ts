import { Exclude, Expose, plainToClass, Type } from 'class-transformer';
import { Organization } from '../../entities';

@Exclude()
export class OrganizationOutput {
  @Expose()
  public id!: string;
  @Expose()
  public name!: string;
  @Expose()
  public slug!: string;
  @Expose()
  public userId!: string;
  @Expose()
  @Type(() => Date)
  public createdAt!: Date;
  @Expose()
  @Type(() => Date)
  public updatedAt!: Date;
  @Expose()
  public createdBy!: string;
  @Expose()
  public updatedBy!: string;

  public static new(organization: Organization): OrganizationOutput {
    return plainToClass(OrganizationOutput, organization);
  }
}

export type CreateOrganizationInput = {
  name: string;
  userId: string;
  createdBy: string;
};

export type UpdateOrganizationInput = {
  id: string;
  name?: string;
  userId?: string;
  updatedBy?: string;
};
