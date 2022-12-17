const htmlparser = require('htmlparser2'); // 解析器

const axios = require('./axios'); // 数据请求
const { nameToUUID } = require('./utils');
const { formatID } = require('../filesystem/utils');

/**
 * Scrapes work metadata from public HVDB page HTML.
 * @param {number} id Work id.
 */
const scrapeWorkMetadataFromHVDB = id => new Promise((resolve, reject) => {
  const rjcode = formatID(id);
  const url = `https://hvdb.me/Dashboard/WorkDetails/${id}`;

  console.log(`[RJ${rjcode}] 从 HVDB 抓取元数据...`);
  axios.retryGet(url, { retry: {} })
    .then(response => {
      console.log('res HVDB');
      return response.data;
    })
    .then((data) => { //解析
      const work = { id, tags: [], vas: [] };
      let writeTo;

      const parser = new htmlparser.Parser({
        onopentag: (name, attrs) => { // 标签名 属性
          if (name === 'input') {
            if (attrs.id === 'Name') {
              work.title = attrs.value;
            } else if (attrs.name === 'SFW') {
              work.nsfw = attrs.value === 'false';
            }
          }

          if (name === 'a') {
            if (attrs.href.indexOf('CircleWorks') !== -1) {
              work.circle = {
                id: attrs.href.substring(attrs.href.lastIndexOf('/') + 1),
              };
              writeTo = 'circle.name';
            } else if (attrs.href.indexOf('TagWorks') !== -1) {
              work.tags.push({
                id: attrs.href.substring(attrs.href.lastIndexOf('/') + 1),
              });
              writeTo = 'tag.name';
            } else if (attrs.href.indexOf('CVWorks') !== -1) {
              work.vas.push({
                //id: hashNameIntoInt(attrs.href), // TODO: RESHNIX!!!
              });
              writeTo = 'va.name';
            }
          }
        },
        onclosetag: () => { writeTo = null; },
        ontext: (text) => {
          switch (writeTo) {
            case 'circle.name':
              work.circle.name = text;
              break;
            case 'tag.name':
              work.tags[work.tags.length - 1].name = text;
              break;
            case 'va.name':
              work.vas[work.vas.length - 1].name = text;
              work.vas[work.vas.length - 1].id = nameToUUID(text);
              break;
            default:
          }
        },
      }, { decodeEntities: true });
      parser.write(data);
      parser.end();

      if (work.tags.length === 0 && work.vas.length === 0) {
        reject(new Error('Couldn\'t parse data from HVDB work page.'));
      } else {
        console.log(`[RJ${rjcode}] 成功从 HVDB 抓取元数据...`);
        resolve(work);
      }
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else if (error.request) {
        reject(error);
        console.log(error.request);
      } else {
        console.log('Error', error.message);
        reject(error);
      }
    });
});


module.exports = scrapeWorkMetadataFromHVDB;
