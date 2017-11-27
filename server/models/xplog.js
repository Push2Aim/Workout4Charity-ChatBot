const bookshelf = require('../bookshelf');
const Profile = require('./profile');

let XpLog = bookshelf.Model.extend({
    tableName: 'xplog',
    profile: () => this.belongsTo('Profile')
});
module.exports = bookshelf.model('XpLog', XpLog);