exports.up = function (knex, Promise) {
    return knex.schema.createTable("workout", function (table) {
        table.increments().primary();
        table.integer("profile_id").references("profile.id").notNullable();

        table.integer("duration").notNullable();
        table.string("location").notNullable();

        table.timestamps();
    }).then(t => console.log("Table workout created", t));
};

exports.down = function (knex, Promise) {
    return knex.schema.dropTable("workout")
        .then(t => console.log("Table workout dropped", t));
};