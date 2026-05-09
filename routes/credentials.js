const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator'); // 后端校验
const { md5 } = require('../auth/utils');
const { canManageUsers, normalizeDisabled, USER_GROUPS } = require('../auth/permissions');
const { config} = require('../config');
const db = require('../database/db');
const userDb = require('../database/users');

const isBuiltInAdmin = user => user.name === 'admin';

const validateGroup = value => {
  if (!USER_GROUPS.includes(value)) {
    throw new Error(`用户组名称必须为 ${JSON.stringify(USER_GROUPS)} 的一个.`)
  }
  return true
}


// 创建一个新用户 (只有管理员账号拥有权限)
router.post('/user', [
  check('name')
    .isLength({ min: 5 })
    .withMessage('用户名长度至少为 5'),
  check('password')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5'),
  check('group')
    .custom(validateGroup),
  check('disabled')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('disabled 必须为布尔值')
], (req, res, next) => {
  // Finds the validation errors in this request and wraps them in an object with handy functions
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).send({ errors: errors.array() });
  }

  const user = {
    name: req.body.name,
    password: req.body.password,
    group: req.body.group,
    disabled: normalizeDisabled(req.body.disabled)
  };

  if (canManageUsers(req)) {
    db.createUser({
      name: user.name,
      password: md5(user.password),
      group: user.group,
      disabled: user.disabled
    })
      .then(() => res.send({ message: `用户 ${user.name} 创建成功.` }))
      .catch((err) => {
        if (err.message.indexOf('已存在') !== -1) {
          res.status(403).send({ error: err.message });
        } else {
          next(err);
        }
      });
  } else {
    res.status(403).send({ error: '只有管理员账号能创建新用户.' });
  }
});

// 更新用户密码
router.put('/user', [
  check('name')
    .isLength({ min: 5 })
    .withMessage('用户名长度至少为 5'),
  check('newPassword')
    .isLength({ min: 5 })
    .withMessage('密码长度至少为 5')
], (req, res, next) => {
  // Finds the validation errors in this request and wraps them in an object with handy functions
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({errors: errors.array()});
  }

  const user = {
    name: req.body.name
  };
  const newPassword = md5(req.body.newPassword);

  if (!config.auth || canManageUsers(req) || req.user.name === user.name) {
    db.updateUserPassword(user, newPassword)
      .then(() => res.send({ message: '密码修改成功.' }))
      .catch((err) => {
        if (err.message.indexOf('用户名') !== -1) {
          res.status(403).send({ error: '用户名错误.' });
        } else {
          next(err);
        }
      });
  } else {
    res.status(403).send({ error: '只能修改自己账号的密码.' });
  }
});

// 更新用户组 (仅管理员账号拥有权限)
router.put('/user/group', [
  check('name')
    .isLength({ min: 5 })
    .withMessage('用户名长度至少为 5'),
  check('group')
    .custom(validateGroup)
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({errors: errors.array()});
  }

  const user = { name: req.body.name };
  const group = req.body.group;

  if (!canManageUsers(req)) {
    res.status(403).send({ error: '只有管理员账号能修改用户组.' });
    return;
  }
  if (isBuiltInAdmin(user)) {
    res.status(403).send({ error: '不能修改内置的管理员账号用户组.' });
    return;
  }

  userDb.updateUserGroup(user, group)
    .then(() => res.send({ message: '用户组修改成功.' }))
    .catch((err) => {
      if (err.message.indexOf('用户名') !== -1) {
        res.status(403).send({ error: '用户名错误.' });
      } else {
        next(err);
      }
    });
});

// 禁用或启用用户 (仅管理员账号拥有权限)
router.put('/user/disabled', [
  check('name')
    .isLength({ min: 5 })
    .withMessage('用户名长度至少为 5'),
  check('disabled')
    .isBoolean()
    .withMessage('disabled 必须为布尔值')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({errors: errors.array()});
  }

  const user = { name: req.body.name };
  const disabled = normalizeDisabled(req.body.disabled);

  if (!canManageUsers(req)) {
    res.status(403).send({ error: '只有管理员账号能禁用或启用用户.' });
    return;
  }
  if (isBuiltInAdmin(user)) {
    res.status(403).send({ error: '不能禁用内置的管理员账号.' });
    return;
  }
  if (config.auth && req.user.name === user.name && disabled) {
    res.status(403).send({ error: '不能禁用当前登录账号.' });
    return;
  }

  userDb.updateUserDisabled(user, disabled)
    .then(() => res.send({ message: disabled ? '用户已禁用.' : '用户已启用.' }))
    .catch((err) => {
      if (err.message.indexOf('用户名') !== -1) {
        res.status(403).send({ error: '用户名错误.' });
      } else {
        next(err);
      }
    });
});

// 删除用户 (仅管理员账号拥有权限)
router.delete('/user', (req, res, next) => {
  const users = req.body.users

  if (canManageUsers(req)) {
    if (!users.find(user => user.name === 'admin')) {
      db.deleteUser(users)
        .then(() => {
          res.send({ message: '删除成功.' });  
        })
        .catch((err) => {
          next(err);
        });
    } else {
      res.status(403).send({ error: '不能删除内置的管理员账号.' });
    }
  } else {
    res.status(403).send({ error: '只有管理员账号能删除用户.' });
  }
});

// 获取所有用户
router.get('/users', (req, res, next) => {
  if (canManageUsers(req)) {
    db.knex('t_user')
    .select('name', 'group', 'disabled')
    .then((users) => {
      res.send({ users });
    })
    .catch((err) => {
      next(err);
    });
  } else {
    res.status(403).send({ error: '只有管理员账号能浏览用户.' });
  }
});

module.exports = router;