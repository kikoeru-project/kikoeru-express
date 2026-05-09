const { config } = require('../config');
const db = require('../database/db');

const ADMIN_GROUP = 'administrator';
const USER_GROUPS = [ADMIN_GROUP, 'user', 'guest'];

const isAdmin = user => !!user && (user.name === 'admin' || user.group === ADMIN_GROUP);
const canManageUsers = req => !config.auth || isAdmin(req.user);
const canManageConfig = req => !config.auth || isAdmin(req.user);

const normalizeDisabled = value => value === true || value === 'true' || value === 1 || value === '1';

const rejectDisabledUser = async (req, res, next) => {
  if (!config.auth || !req.user || !req.user.name) {
    next();
    return;
  }

  try {
    const user = await db.knex('t_user')
      .select('disabled')
      .where('name', '=', req.user.name)
      .first();

    if (!user || normalizeDisabled(user.disabled)) {
      res.status(403).send({ error: '账号已被禁用.' });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  ADMIN_GROUP,
  USER_GROUPS,
  isAdmin,
  canManageUsers,
  canManageConfig,
  normalizeDisabled,
  rejectDisabledUser
};
