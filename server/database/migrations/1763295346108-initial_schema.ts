import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1763295346108 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."merge_requests_status_enum" AS ENUM('open', 'approved', 'rejected', 'merged', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."spatial_features_geometry_type_enum" AS ENUM('Point', 'Line', 'Polygon', 'MultiPoint', 'MultiLine', 'MultiPolygon')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."spatial_features_operation_enum" AS ENUM('create', 'update', 'delete')`,
    );

    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_departments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "username" character varying NOT NULL,
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'user',
        "department_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "datasets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "department_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_datasets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "branches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "is_main" boolean NOT NULL DEFAULT false,
        "dataset_id" uuid NOT NULL,
        "created_by_id" uuid NOT NULL,
        "head_commit_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_branches_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "commits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "message" character varying NOT NULL,
        "branch_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "parent_commit_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commits_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "merge_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" character varying,
        "source_branch_id" uuid NOT NULL,
        "target_branch_id" uuid NOT NULL,
        "created_by_id" uuid NOT NULL,
        "reviewed_by_id" uuid,
        "status" "public"."merge_requests_status_enum" NOT NULL DEFAULT 'open',
        "conflicts" jsonb,
        "has_conflicts" boolean NOT NULL DEFAULT false,
        "review_comment" character varying,
        "mergedAt" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merge_requests_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "spatial_features" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "feature_id" character varying,
        "geometry_type" "public"."spatial_features_geometry_type_enum" NOT NULL,
        "geometry" jsonb NOT NULL,
        "geom" geometry(Geometry, 4326),
        "properties" jsonb,
        "operation" "public"."spatial_features_operation_enum" NOT NULL DEFAULT 'create',
        "commit_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_spatial_features_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_spatial_features_geom" ON "spatial_features" USING GIST ("geom")`,
    );

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_department_id"
      FOREIGN KEY ("department_id")
      REFERENCES "departments"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "datasets"
      ADD CONSTRAINT "FK_datasets_department_id"
      FOREIGN KEY ("department_id")
      REFERENCES "departments"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "branches"
      ADD CONSTRAINT "FK_branches_dataset_id"
      FOREIGN KEY ("dataset_id")
      REFERENCES "datasets"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "branches"
      ADD CONSTRAINT "FK_branches_created_by_id"
      FOREIGN KEY ("created_by_id")
      REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "commits"
      ADD CONSTRAINT "FK_commits_branch_id"
      FOREIGN KEY ("branch_id")
      REFERENCES "branches"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "commits"
      ADD CONSTRAINT "FK_commits_author_id"
      FOREIGN KEY ("author_id")
      REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "commits"
      ADD CONSTRAINT "FK_commits_parent_commit_id"
      FOREIGN KEY ("parent_commit_id")
      REFERENCES "commits"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "branches"
      ADD CONSTRAINT "FK_branches_head_commit_id"
      FOREIGN KEY ("head_commit_id")
      REFERENCES "commits"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "merge_requests"
      ADD CONSTRAINT "FK_mr_source_branch_id"
      FOREIGN KEY ("source_branch_id")
      REFERENCES "branches"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "merge_requests"
      ADD CONSTRAINT "FK_mr_target_branch_id"
      FOREIGN KEY ("target_branch_id")
      REFERENCES "branches"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "merge_requests"
      ADD CONSTRAINT "FK_mr_created_by_id"
      FOREIGN KEY ("created_by_id")
      REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "merge_requests"
      ADD CONSTRAINT "FK_mr_reviewed_by_id"
      FOREIGN KEY ("reviewed_by_id")
      REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "spatial_features"
      ADD CONSTRAINT "FK_spatial_features_commit_id"
      FOREIGN KEY ("commit_id")
      REFERENCES "commits"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "spatial_features" DROP CONSTRAINT "FK_spatial_features_commit_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "merge_requests" DROP CONSTRAINT "FK_mr_source_branch_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merge_requests" DROP CONSTRAINT "FK_mr_target_branch_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merge_requests" DROP CONSTRAINT "FK_mr_created_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merge_requests" DROP CONSTRAINT "FK_mr_reviewed_by_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT "FK_branches_head_commit_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "commits" DROP CONSTRAINT "FK_commits_branch_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commits" DROP CONSTRAINT "FK_commits_author_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "commits" DROP CONSTRAINT "FK_commits_parent_commit_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT "FK_branches_dataset_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branches" DROP CONSTRAINT "FK_branches_created_by_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "datasets" DROP CONSTRAINT "FK_datasets_department_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_department_id"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_spatial_features_geom"`);

    await queryRunner.query(`DROP TABLE "spatial_features"`);
    await queryRunner.query(`DROP TABLE "merge_requests"`);
    await queryRunner.query(`DROP TABLE "commits"`);
    await queryRunner.query(`DROP TABLE "branches"`);
    await queryRunner.query(`DROP TABLE "datasets"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "departments"`);

    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TYPE "public"."merge_requests_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."spatial_features_geometry_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."spatial_features_operation_enum"`,
    );
  }
}
