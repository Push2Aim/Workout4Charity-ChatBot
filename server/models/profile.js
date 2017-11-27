const bookshelf = require('../bookshelf');
const User = require('./user');
const Workout = require('./workout');

var Profile = bookshelf.Model.extend({
    tableName: 'profile',
    user: () => this.belongsTo('User'),
    workout: function () {
        return this.hasMany('Workout');
    },
    xplog: function () {
        return this.hasMany('XpLog');
    }
});
module.exports = bookshelf.model('Profile', Profile);