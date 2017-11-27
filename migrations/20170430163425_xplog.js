exports.up = function (knex, Promise) {
    return knex.schema.createTable("xplog", function (table) {
        table.increments().primary();
        table.integer("profile_id").references("profile.id").notNullable();

        table.integer("xp").notNullable();

        table.timestamps();
    }).then(t => console.log("Table xplog created", t));
};

exports.down = function (knex, Promise) {
    return knex.schema.dropTable("xplog")
        .then(t => console.log("Table xplog dropped", t));
};