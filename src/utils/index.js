/* eslint-disable no-sync */
const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const style = require('ansi-styles');
const error = require('./error');

const PREFIX_78 = `78`;

const createDirIfNotExists = dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
};

const utils = {
  color: _.curry((colorName, str) => {
    if (str) {
      return style[colorName].open + str + style[colorName].close;
    }
    return '';
  }),
  indent: '\n  ',
  modelDir: `${process.cwd()}/models`,
  migrationDir: `${process.cwd()}/migrations`,
  dataDir: `${process.cwd()}/data`,
  makeModelDir() {
    createDirIfNotExists(utils.modelDir);
  },
  makeMigrationDir() {
    createDirIfNotExists(utils.migrationDir);
  },
  getTemplate(name) {
    const modelTemplate = fs.readFileSync(path.resolve(__dirname, `../templates/${name}.tpl`)).toString();
    return options => modelTemplate.replace(/\{\{([^}]+)\}\}/g, (str, match) => options[match]);
  },
  log(clr) {
    return (...args) => console.log(`  ${utils.prefix(clr)}`, ...args);
  },
  prefix(clr) {
    return utils.color(clr)(PREFIX_78);
  },
  buildIndex(list, key) {
    return list.reduce((memo, item) => {
      memo[item[key]] = item;
      return memo;
    }, {});
  },
  async inSerial(items, promiser/*, asTransaction */) {
    const evaluate = async () => {
      const results = [];
      for (const item of items) {
        try {
          results.push(await promiser(item)); // eslint-disable-line no-await-in-loop
        } catch (err) {
          throw err;
        }
      }
      return results;
    };
    await evaluate();
  },
  error,
};

module.exports = utils;
