const db = require('./db');

const getUser = user => db.knex('t_user')
  .where('name', '=', user.name)
  .first();

const updateUserGroup = async (user, group) => db.knex.transaction(async (trx) => {
  const found = await trx('t_user')
    .where('name', '=', user.name)
    .first();

  if (!found) {
    throw new Error('用户名错误.');
  }

  return trx('t_user')
    .where('name', '=', user.name)
    .update({ group });
});

const updateUserDisabled = async (user, disabled) => db.knex.transaction(async (trx) => {
  const found = await trx('t_user')
    .where('name', '=', user.name)
    .first();

  if (!found) {
    throw new Error('用户名错误.');
  }

  return trx('t_user')
    .where('name', '=', user.name)
    .update({ disabled });
});

module.exports = {
  getUser,
  updateUserGroup,
  updateUserDisabled
};
