let env = process.env.NODE_ENV ? process.env.NODE_ENV : "development";
const
 knex = require('knex');
 knexfile = require('../knexfile');
 bookshelf = require('bookshelf')(knex(knexfile[env]));

bookshelf.plugin('registry');
console.log("load knexfile environment:",env)
module.exports = bookshelf;

// Add Bookshelf models here:
require('./models/profile');
require('./models/user');
require('./models/workout');
require('./models/xplog');