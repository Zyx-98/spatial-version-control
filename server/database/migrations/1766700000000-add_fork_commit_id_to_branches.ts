import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddForkCommitIdToBranches1766700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches
      ADD COLUMN fork_commit_id UUID REFERENCES commits(id)
    `);

    await queryRunner.query(`
      UPDATE branches b
      SET fork_commit_id = b.head_commit_id
      WHERE b.head_commit_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches DROP COLUMN IF EXISTS fork_commit_id
    `);
  }
}
