// Replaced by staticMetadata
exports.up = async function(knex) {
  await knex.schema.raw('DROP VIEW IF EXISTS userMetadata');
};

// Bring up old userMetadata to revert
exports.down = async function(knex) {
  try {
    await knex.schema.raw(
      `CREATE VIEW IF NOT EXISTS userMetadata AS
      SELECT t_work.id,
        t_work.title,
        json_object('id', t_work.circle_id, 'name', t_circle.name) AS circleObj,
        json_object('id', t_work.series_id, 'name', t_series.name) AS seriesObj,
        t_work.release,
        t_work.review_count,
        t_work.dl_count,
        t_work.nsfw,
        userrate.userRating,
        userrate.review_text,
        userrate.progress,
        userrate.updated_at,
        json_object('vas', json_group_array(json_object('id', t_va.id, 'name', t_va.name))) AS vaObj,
        userrate.user_name
      FROM t_work
      JOIN t_circle on t_circle.id = t_work.circle_id
      JOIN t_series on t_series.id = t_work.series_id
      JOIN r_va_work on r_va_work.work_id = t_work.id
      join t_va on t_va.id = r_va_work.va_id
      JOIN (
          SELECT t_review.work_id,
            t_review.rating AS userRating,
            t_review.review_text,
            t_review.progress,
            strftime('%Y-%m-%d %H-%M-%S', t_review.updated_at, 'localtime') AS updated_at,
            t_review.user_name
          FROM t_review
            JOIN t_work on t_work.id = t_review.work_id
          ) AS userrate
      ON userrate.work_id = t_work.id
      GROUP BY t_work.id, userrate.user_name
    `);
  } catch (error) {
    console.error(error);
    throw error;
  }
};
