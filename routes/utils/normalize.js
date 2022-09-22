const strftime  = require('./strftime')

// Normalize API endpoints
const normalize = (works, options = {}) => {
  works.map(record => {
    record.nsfw = Boolean(record.nsfw);
    record.circle = JSON.parse(record.circleObj);
    record.series = JSON.parse(record.seriesObj);
    record.rate_count_detail = JSON.parse(record.rate_count_detail);
    record.rank = record.rank ? JSON.parse(record.rank) : null;
    record.vas = JSON.parse(record.vaObj)['vas'];
    record.tags = JSON.parse(record.tagObj)['tags'];
    delete record.circleObj;
    delete record.seriesObj;
    delete record.vaObj;
    delete record.tagObj;
    if (options.dateOnly && record.updated_at) {
      record.updated_at = strftime('%F', record.updated_at);
    }
  })
  return works
}

module.exports = normalize;