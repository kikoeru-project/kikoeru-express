const uuidv5 = require('uuid').v5

const nameToUUID = (name) => {
  const namespace =  '699d9c07-b965-4399-bafd-18a3cacf073c';
  return uuidv5(name, namespace);
};

/**
 * 判断一个字符串中是否包含字母
 * @param {String} str
 */
const hasLetter = (str) => {
  for (let i in str) {
    let asc = str.charCodeAt(i);
    if ((asc >= 65 && asc <= 90 || asc >= 97 && asc <= 122)) {
      return true;
    }
  }
  return false;
};

module.exports = {
  nameToUUID, hasLetter
};