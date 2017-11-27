const bookshelf = require('../bookshelf');
const Profile = require('./profile');

let Workout = bookshelf.Model.extend({
    tableName: 'workout',
    profile: () => this.belongsTo('Profile')
});
module.exports = bookshelf.model('Workout', Workout);