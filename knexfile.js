// Load environment variables from .env file
if (process.env.NODE_ENV !== "production")
    loadEnvironmentVariables();
function loadEnvironmentVariables() {
    let dotenv = require('dotenv');
    dotenv.load();
}

// Update with your config settings.

module.exports = {

  development: {
      client: 'postgresql',
      connection: {
          database: process.env.DEV_DB_DATABASE,
          user:     process.env.DEV_DB_USER,
          password: ''
      },
      pool: {
          min: 2,
          max: 10
      },
      migrations: {
          tableName: 'knex_migrations'
      }
  },

  staging: {
    client: 'postgresql',
    connection: {
      database: 'my_db',
      user:     'username',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },

  production: {
      client: 'mssql',
      connection: {
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          server: process.env.DB_SERVER,
          database: process.env.DB_DATABASE,
          options: {
              encrypt: true,
          },
      },
      migrations: {
          tableName: 'knex_migrations'
      }
  }
};
