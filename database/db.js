const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const databaseExist = fs.existsSync(path.join(config.databaseFolderDir, 'db.sqlite3'));

// knex 操作数据库
const connEnv = process.env.KNEX_ENV || process.env.NODE_ENV || 'development';
const conn = require('./knexfile')[connEnv]
const knex = require('knex')(conn);

/**
 * Takes a work metadata object and inserts it into the database.
 * @param {Object} work Work object.
 */
// Using trx as a query builder:
const insertWorkMetadata = work => knex.transaction(trx => trx.raw(
  trx('t_circle')
    .insert({
      id: work.circle.id,
      name: work.circle.name,
    }).toString().replace('insert', 'insert or ignore'),
)
  .then(() => trx('t_work')
    .insert({
      id: work.id,
      root_folder: work.rootFolderName,
      dir: work.dir,
      title: work.title,
      circle_id: work.circle.id,
      nsfw: work.nsfw,
      release: work.release,

      dl_count: work.dl_count,
      price: work.price,
      review_count: work.review_count,
      rate_count: work.rate_count,
      rate_average_2dp: work.rate_average_2dp,
      rate_count_detail: JSON.stringify(work.rate_count_detail),
      rank: work.rank ? JSON.stringify(work.rank) : null
    }))
  .then(() => {
    // Now that work is in the database, insert relationships
    const promises = [];

    for (let i = 0; i < work.tags.length; i += 1) {
      promises.push(trx.raw(
        trx('t_tag')
          .insert({
            id: work.tags[i].id,
            name: work.tags[i].name,
          }).toString().replace('insert', 'insert or ignore'),
      )
        .then(() => trx('r_tag_work')
          .insert({
            tag_id: work.tags[i].id,
            work_id: work.id,
          })));
    }

    for (let i = 0; i < work.vas.length; i += 1) {
      promises.push(trx.raw(
        trx('t_va')
          .insert({
            id: work.vas[i].id,
            name: work.vas[i].name,
          }).toString().replace('insert', 'insert or ignore'),
      )
        .then(() => trx.raw(
          trx('r_va_work')
            .insert({
              va_id: work.vas[i].id,
              work_id: work.id,
            }).toString().replace('insert', 'insert or ignore'))));
    }

    return Promise.all(promises)
      .then(() => trx);
  }));

/**
 * 更新音声的动态元数据
 * @param {Object} work Work object.
 */
const updateWorkMetadata = (work, options = {}) => knex.transaction(async (trx) => {
  await trx('t_work')
    .where('id', '=', work.id)
    .update({
      dl_count: work.dl_count,
      price: work.price,
      review_count: work.review_count,
      rate_count: work.rate_count,
      rate_average_2dp: work.rate_average_2dp,
      rate_count_detail: JSON.stringify(work.rate_count_detail),
      rank: work.rank ? JSON.stringify(work.rank) : null,
    });

  if (options.includeVA || options.refreshAll) {
    await trx('r_va_work').where('work_id', work.id).del();
    for (const va of work.vas) {
      await trx.raw('INSERT OR IGNORE INTO t_va(id, name) VALUES (?, ?)', [va.id, va.name]);
      await trx.raw('INSERT OR IGNORE INTO r_va_work(va_id, work_id) VALUES (?, ?)', [va.id, work.id]);
    }
  }
  if (options.includeTags || options.refreshAll) {
    if (options.purgeTags) {
      await trx('r_tag_work').where('work_id', work.id).del();
    }
    for (const tag of work.tags) {
      await trx.raw('INSERT OR IGNORE INTO t_tag(id, name) VALUES (?, ?)', [tag.id, tag.name]);
      await trx.raw('INSERT OR IGNORE INTO r_tag_work(tag_id, work_id) VALUES (?, ?)', [tag.id, work.id]);
    }
  }

  // Fix a bug caused by DLsite changes
  if (options.includeNSFW) {
    await trx('t_work')
    .where('id', '=', work.id)
    .update({
      nsfw: work.nsfw
    });
  }

  if (options.refreshAll) {
    await trx('t_work')
    .where('id', '=', work.id)
    .update({
      nsfw: work.nsfw,
      title: work.title,
      release: work.release,
    });
  }
});


/**
 * Fetches metadata for a specific work id.
 * @param {Number} id Work identifier.
 * @param {String} username 'admin' or other usernames for current user
 */
const getWorkMetadata = async (id, username) => {
  // TODO: do this all in a single transaction?
  // <= Yes, WTF is this
  // I think we are done.

    const ratingSubQuery = knex('t_review')
    .select(['t_review.work_id', 't_review.rating AS userRating', 't_review.review_text', 't_review.progress', knex.raw('strftime(\'%Y-%m-%d %H-%M-%S\', t_review.updated_at, \'localtime\') AS updated_at'), 't_review.user_name'])
    .join('t_work', 't_work.id', 't_review.work_id')
    .where('t_review.user_name', username).as('userrate');

    let query = () => knex('staticMetadata')
      .select(['staticMetadata.*', 'userrate.userRating', 'userrate.review_text', 'userrate.progress', 'userrate.updated_at', 'userrate.user_name'])
      .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
      .where('id', '=', id);

    const work = await query();
    if (work.length === 0) throw new Error(`There is no work with id ${id} in the database.`);
    return work;
};

/**
 * Tests if the given circle, tags and VAs are orphans and if so, removes them.
 * @param {*} trx Knex transaction object.
 * @param {*} circle Circle id to check.
 * @param {*} tags Array of tag ids to check.
 * @param {*} vas Array of VA ids to check.
 */
const cleanupOrphans = async (trxProvider, circle, tags, vas)  => {
  const trx = await trxProvider();
  const getCount = (tableName, colName, colValue) => new Promise((resolveCount, rejectCount) => {
    trx(tableName)
      .select(colName)
      .where(colName, '=', colValue)
      .count()
      .first()
      .then(res => res['count(*)'])
      .then(count => resolveCount(count))
      .catch(err => rejectCount(err));
  });

  const promises = [];
  promises.push(new Promise((resolveCircle, rejectCircle) => {
    getCount('t_work', 'circle_id', circle)
      .then((count) => {
        if (count === 0) {
          trx('t_circle')
            .del()
            .where('id', '=', circle)
            .then(() => resolveCircle())
            .catch(err => rejectCircle(err));
        } else {
          resolveCircle();
        }
      });
  }));

  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    const count = await getCount('r_tag_work', 'tag_id', tag);

    if (count === 0) {
      promises.push(
        trx('t_tag')
          .delete()
          .where('id', '=', tag),
      );
    }
  }

  for (let i = 0; i < vas.length; i += 1) {
    const va = vas[i];
    const count = await getCount('r_va_work', 'va_id', va);

    if (count === 0) {
      promises.push(
        trx('t_va')
          .delete()
          .where('id', '=', va),
      );
    }
  }

  await Promise.all(promises);
};

/**
 * Removes a work and then its orphaned circles, tags & VAs from the database.
 * @param {Integer} id Work id.
 */
const removeWork = async (id, trxProvider) => {
  const trx = await trxProvider();
  // Save circle, tags and VAs to array for later testing
    const circle = await trx('t_work').select('circle_id').where('id', '=', id).first();
    const tags = await trx('r_tag_work').select('tag_id').where('work_id', '=', id);
    const vas = await trx('r_va_work').select('va_id').where('work_id', '=', id);

    await trx('r_tag_work').del().where('work_id', '=', id);
    await trx('r_va_work').del().where('work_id', '=', id);
    await trx('t_review').del().where('work_id', '=', id);
    await trx('t_work').del().where('id', '=', id);
    await cleanupOrphans(
      trxProvider,
      circle.circle_id,
      tags.map(tag => tag.tag_id),
      vas.map(va => va.va_id),
    )
};

/**
 * Returns list of works by circle, tag or VA.
 * @param {Number} id Which id to filter by.
 * @param {String} field Which field to filter by.
 */
const getWorksBy = ({id, field, username = ''} = {}) => {
  let workIdQuery;
  const ratingSubQuery = knex('t_review')
    .select(['t_review.work_id', 't_review.rating'])
    .join('t_work', 't_work.id', 't_review.work_id')
    .where('t_review.user_name', username).as('userrate')

  switch (field) {
    case 'circle':
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('circle_id', '=', id);

    case 'tag':
      workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', '=', id);
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('id', 'in', workIdQuery);

    case 'va':
      workIdQuery = knex('r_va_work').select('work_id').where('va_id', '=', id);
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
        .where('id', 'in', workIdQuery);

    default:
      return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
        .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id');
  }
};

/**
 * 根据关键字查询音声
 * @param {String} keyword
 */
const getWorksByKeyWord = ({keyword, username = 'admin'} = {}) => {
  const ratingSubQuery = knex('t_review')
  .select(['t_review.work_id', 't_review.rating'])
  .join('t_work', 't_work.id', 't_review.work_id')
  .where('t_review.user_name', username).as('userrate')

  const workid = keyword.match(/((R|r)(J|j))?(\d{6})/) ? keyword.match(/((R|r)(J|j))?(\d{6})/)[4] : '';
  if (workid) {
    return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
      .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
      .where('id', '=', workid);
  }

  const circleIdQuery = knex('t_circle').select('id').where('name', 'like', `%${keyword}%`);

  const tagIdQuery = knex('t_tag').select('id').where('name', 'like', `%${keyword}%`);
  const vaIdQuery = knex('t_va').select('id').where('name', 'like', `%${keyword}%`);

  const workIdQuery = knex('r_tag_work').select('work_id').where('tag_id', 'in', tagIdQuery).union([
    knex('r_va_work').select('work_id').where('va_id', 'in', vaIdQuery)
  ]);


  return knex('staticMetadata').select(['staticMetadata.*', 'userrate.rating AS userRating'])
    .leftJoin(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
    .where('title', 'like', `%${keyword}%`)
    .orWhere('circle_id', 'in', circleIdQuery)
    .orWhere('id', 'in', workIdQuery);
};

/**
 * 获取所有社团/标签/声优的元数据列表
 * @param {Starting} field ['circle', 'tag', 'va'] 中的一个
 */
const getLabels = (field) => {
  if (field === 'circle') {
    return knex('t_work')
      .join(`t_${field}`, `${field}_id`, '=', `t_${field}.id`)
      .select(`t_${field}.id`, 'name')
      .groupBy(`${field}_id`)
      .count(`${field}_id as count`);
  } else if (field === 'tag' || field === 'va') {
    return knex(`r_${field}_work`)
      .join(`t_${field}`, `${field}_id`, '=', 'id')
      .select('id', 'name')
      .groupBy(`${field}_id`)
      .count(`${field}_id as count`);
  }
};

/**
 * 创建一个新用户
 * @param {Object} user User object.
 */
const createUser = user => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (res) {
      throw new Error(`用户 ${user.name} 已存在.`);
    }
    return trx('t_user')
      .insert(user);
  }));

/**
 * 更新用户密码
 * @param {Object} user User object.
 * @param {String} newPassword new password
 */
const updateUserPassword = (user, newPassword) => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (!res) {
      throw new Error('用户名或密码错误.');
    }
    return trx('t_user')
      .where('name', '=', user.name)
      .update({
        password: newPassword
      });
  }));

/**
 * 重置用户密码为 "password"
 * @param {Object} user User object.
 */
const resetUserPassword = (user) => knex.transaction(trx => trx('t_user')
  .where('name', '=', user.name)
  .first()
  .then((res) => {
    if (!res) {
      throw new Error('用户名错误.');
    }
    return trx('t_user')
      .where('name', '=', user.name)
      .update({
        password: 'password'
      });
  }));

/**
 * 删除用户
 * @param {Object} user User object.
 */
const deleteUser = users => knex.transaction(trx => trx('t_user')
  .where('name', 'in', users.map(user => user.name))
  .del());


// 添加星标或评语或进度
const updateUserReview = async (username, workid, rating, review_text = '', progress = '', starOnly = true, progressOnly= false) => knex.transaction(async(trx) => {
    //UPSERT
    if (starOnly) {
      await trx.raw('UPDATE t_review SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [rating, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, rating) VALUES (?, ?, ?);', [username, workid, rating]);
    } else if (progressOnly) {
      await trx.raw('UPDATE t_review SET progress = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [progress, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, progress) VALUES (?, ?, ?);', [username, workid, progress]);
    } else {
      await trx.raw('UPDATE t_review SET rating = ?, review_text = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND work_id = ?;', [rating, review_text, progress, username, workid]);
      await trx.raw('INSERT OR IGNORE INTO t_review (user_name, work_id, rating, review_text, progress) VALUES (?, ?, ?, ?, ?);', [username, workid, rating, review_text, progress]);
    }
});

// 删除星标、评语及进度
const deleteUserReview = (username, workid) => knex.transaction(trx => trx('t_review')
  .where('user_name', '=', username)
  .andWhere('work_id', '=', workid)
  .del());

// 读取星标及评语 + 作品元数据
const getWorksWithReviews = async ({username = '', limit = 1000, offset = 0, orderBy = 'release', sortOption = 'desc', filter} = {}) => {
  let works = [];
  let totalCount = 0;

  const ratingSubQuery = knex('t_review')
  .select(['t_review.work_id', 't_review.rating AS userRating', 't_review.review_text', 't_review.progress', knex.raw('strftime(\'%Y-%m-%d %H-%M-%S\', t_review.updated_at, \'localtime\') AS updated_at'), 't_review.user_name'])
  .join('t_work', 't_work.id', 't_review.work_id')
  .where('t_review.user_name', username).as('userrate');

  let query = () => knex('staticMetadata')
    .select(['staticMetadata.*', 'userrate.userRating', 'userrate.review_text', 'userrate.progress', 'userrate.updated_at', 'userrate.user_name'])
    .join(ratingSubQuery, 'userrate.work_id', 'staticMetadata.id')
    .orderBy(orderBy, sortOption).orderBy([{ column: 'release', order: 'desc'}, { column: 'id', order: 'desc' }]);

  if (filter) {
    totalCount = await query().where('progress', '=', filter).count('id as count');
    works = await query().where('progress', '=', filter).limit(limit).offset(offset);
  } else {
    totalCount = await query().count('id as count');
    works = await query().limit(limit).offset(offset);
  }

  return {works, totalCount};
};

const getMetadata = ({field = 'circle', id} = {}) => {
  const validFields = ['circle', 'tag', 'va'];
  if (!validFields.includes(field)) throw new Error('无效的查询域');
  return knex(`t_${field}`)
    .select('*')
    .where('id', '=', id)
    .first()
}

module.exports = {
  knex, insertWorkMetadata, getWorkMetadata, removeWork, getWorksBy, getWorksByKeyWord, updateWorkMetadata,
  getLabels, getMetadata,
  createUser, updateUserPassword, resetUserPassword, deleteUser,
  getWorksWithReviews, updateUserReview, deleteUserReview,
  databaseExist
};
