exports.up = async function(knex) {
  const hasDisabled = await knex.schema.hasColumn('t_user', 'disabled');
  if (!hasDisabled) {
    await knex.schema.table('t_user', (table) => {
      table.boolean('disabled').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function(knex) {
  const hasDisabled = await knex.schema.hasColumn('t_user', 'disabled');
  if (hasDisabled) {
    await knex.schema.table('t_user', (table) => {
      table.dropColumn('disabled');
    });
  }
};
