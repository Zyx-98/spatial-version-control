import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHasUnresolvedConflictsToBranch1763474938094
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" ADD "has_unresolved_conflicts" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "branches" DROP COLUMN "has_unresolved_conflicts"`,
    );
  }
}
