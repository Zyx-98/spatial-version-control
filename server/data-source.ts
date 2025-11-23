import 'dotenv/config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
console.log(process.env.DB_NAME);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [join(__dirname, 'src/entities/**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'database/migrations/**/*{.ts,.js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  migrationsTableName: 'typeorm_migrations',
  metadataTableName: 'typeorm_metadata',
  migrationsTransactionMode: 'each', // Allow individual migrations to control transactions
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
