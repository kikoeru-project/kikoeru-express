exports.up = async function(knex) {
  await knex.raw(`PRAGMA foreign_keys=off;`);

  await knex.transaction(async (trx) => {
    trx.raw('DROP INDEX IF EXISTS t_work_circle_series_id_release_dl_count_review_count_price_rate_average_2dp_index');

    // SQLite allows DDL in transaction
    await trx.schema.createTable('t_work_new', (table) => {
      table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [音声id]
      table.string('root_folder').notNullable(); // VARCHAR 类型 [根文件夹别名]
      table.string('dir').notNullable(); // VARCHAR 类型 [相对存储路径]
      table.string('title').notNullable(); // VARCHAR 类型 [音声名称]
      table.integer('circle_id').notNullable(); // INTEGER 类型 [社团id]
      table.integer('series_id').notNullable(); // INTEGER 类型 [社团id]
      table.boolean('nsfw'); // BOOLEAN 类型
      table.string('release');  // VARCHAR 类型 [贩卖日 (YYYY-MM-DD)]
  
      table.integer('dl_count'); // INTEGER 类型 [售出数]
      table.integer('price'); // INTEGER 类型 [价格]
      table.integer('review_count'); // INTEGER 类型 [评论数量]
      table.integer('rate_count'); // INTEGER 类型 [评价数量]
      table.float('rate_average_2dp'); // FLOAT 类型 [平均评价]
      table.text('rate_count_detail'); // TEXT 类型 [评价分布明细]
      table.text('rank'); // TEXT 类型 [历史销售业绩]
      
      table.foreign('circle_id').references('id').inTable('t_circle'); // FOREIGN KEY 外键
      table.foreign('series_id').references('id').inTable('t_series'); // FOREIGN KEY 外键
      table.index(['circle_id', 'series_id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp'], 't_work_index'); // INDEX 索引
    })
    await trx.raw(`INSERT INTO t_work_new SELECT * FROM t_work;`);
    await trx.raw(`DROP TABLE t_work;`);
    await trx.raw(`ALTER TABLE t_work_new RENAME TO t_work;`);
  }).catch(err => console.error(err));

  await knex.raw(`PRAGMA foreign_keys=on;`);
};

exports.down = async function(knex) {
  await knex.raw(`PRAGMA foreign_keys=off;`);

  await knex.transaction(async (trx) => {
    trx.raw('DROP INDEX IF EXISTS t_work_index');

    // SQLite allows DDL in transaction
    await trx.schema.createTable('t_work_new', (table) => {
      table.increments(); // id自增列(INTEGER 类型)，会被用作主键 [音声id]
      table.string('root_folder').notNullable(); // VARCHAR 类型 [根文件夹别名]
      table.string('dir').notNullable(); // VARCHAR 类型 [相对存储路径]
      table.string('title').notNullable(); // VARCHAR 类型 [音声名称]
      table.integer('circle_id').notNullable(); // INTEGER 类型 [社团id]
      table.integer('series_id').notNullable(); // INTEGER 类型 [社团id]
      table.boolean('nsfw').notNullable(); // BOOLEAN 类型
      table.string('release').notNullable();  // VARCHAR 类型 [贩卖日 (YYYY-MM-DD)]
  
      table.integer('dl_count').notNullable(); // INTEGER 类型 [售出数]
      table.integer('price').notNullable(); // INTEGER 类型 [价格]
      table.integer('review_count').notNullable(); // INTEGER 类型 [评论数量]
      table.integer('rate_count').notNullable(); // INTEGER 类型 [评价数量]
      table.float('rate_average_2dp').notNullable(); // FLOAT 类型 [平均评价]
      table.text('rate_count_detail').notNullable(); // TEXT 类型 [评价分布明细]
      table.text('rank'); // TEXT 类型 [历史销售业绩]
      
      table.foreign('circle_id').references('id').inTable('t_circle'); // FOREIGN KEY 外键
      table.foreign('series_id').references('id').inTable('t_series'); // FOREIGN KEY 外键
      table.index(['circle_id','series_id', 'release', 'dl_count', 'review_count', 'price', 'rate_average_2dp'], 't_work_circle_series_id_release_dl_count_review_count_price_rate_average_2dp_index'); // INDEX 索引
    })
    await trx.raw(`INSERT INTO t_work_new SELECT * FROM t_work;`);
    await trx.raw(`DROP TABLE t_work;`);
    await trx.raw(`ALTER TABLE t_work_new RENAME TO t_work;`);
  }).catch(err => console.error(err));

  await knex.raw(`PRAGMA foreign_keys=on;`);
};
