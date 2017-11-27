const bookshelf = require('../bookshelf');
const Profile = require('./profile');

var User = bookshelf.Model.extend({
    tableName: 'user',
    profile: () => this.hasOne('Profile')
});
module.exports = bookshelf.model('User', User);