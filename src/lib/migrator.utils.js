const _ = require('lodash');
const {
  PRIMARY,
  UNIQUE,
  INDEXED,
  FOREIGN,
  getMappers,
} = require('./migrator.utils.mappers');

const schemaProps = [
  'name',
  'type',
  'length',
  'required',
  'default',
  'autoIncrement',
  'signed',
  'column',
  'oneToOne',
  'inverse',
];

const keyProps = [
  'name',
  'column',
  'type',
  'relation',
  'relationColumn',
  'sync',
  'keyLength',
];

const typeMapping = {
  int: 'INT',
  boolean: 'TINYINT',
  string: 'VARCHAR',
  time: 'DATETIME',
  json: 'LONGTEXT',
  text: 'LONGTEXT',
};

const getUtils = context => {
  const mappers = getMappers(context);
  const applyFieldFilters = mappers.applyFilters('fields', Object.keys(mappers.fields));
  const applyKeyFilters = mappers.applyFilters('keys', keyProps);

  const groupByKeys = (schema, field) => {
    const groups = _(schema).filter(field).groupBy(field).value();
    const individualKeys = groups.true;
    delete groups.true;
    return _.chunk(individualKeys, 1).concat(_.values(groups));
  };

  const getFieldKeys = schema => ({
    [PRIMARY]: [[schema.find(field => field.primary)]],
    [UNIQUE]: groupByKeys(schema, UNIQUE),
    [INDEXED]: groupByKeys(schema, INDEXED),
    [FOREIGN]: schema.filter(field => field.relation).map(field => [field]),
  });

  const utils = {
    schemaDiff: mappers.diff(schemaProps),
    keyDiff: mappers.diff(keyProps),

    applyKeyDefaults(schema) {
      const fieldKeysGroups = getFieldKeys(schema);
      return _.flatMap(fieldKeysGroups, (keySets, type) => {
        if (keySets.length) {
          return keySets.map(keySet => applyKeyFilters('default', keySet, type));
        }
        return null;
      }).filter(key => key);
    },

    writeKeysToSQL(method) {
      return keys => keys.map(key => mappers.runMapper('keys', 'type', 'toSQL', key, method));
    },

    parseKeysFromSQL(indexes) {
      return _(indexes)
        .groupBy('KEY_NAME')
        .toPairs()
        .map(([, keys]) => applyKeyFilters('fromSQL', keys))
        .value();
    },

    applySchemaDefaults(schemaField) {
      return applyFieldFilters('default', schemaField);
    },

    writeSchemaToSQL(schemaField, method) {
      const field = applyFieldFilters('toSQL', schemaField);
      const config = `\`${field.column}\` ${field.type}${field.length} ${field.signed} ${field.required} ${field.autoIncrement} ${field.default} ${field.comment}`.replace(/\s+/g, ' ').trim();
      if (method === 'create') {
        return `ADD COLUMN ${config}`;
      }
      if (method === 'remove') {
        return `DROP COLUMN \`${field.column}\``;
      }
      if (method === 'update') {
        return `MODIFY ${config}`;
      }
      return config;
    },

    parseSchemaFieldFromSQL(keys) {
      return sqlField => {
        sqlField.keys = keys.filter(key => key.column.match(`\`${sqlField.COLUMN_NAME}\``));
        return applyFieldFilters('fromSQL', sqlField);
      };
    },

    schemaValidationError(schemaFields) {
      const validTypes = schemaFields.reduce((memo, field) => memo && Object.keys(typeMapping).includes(field.type), true);
      if (!validTypes) {
        return `invalid field type '${schemaFields.map(field => field.type).filter(type => !Object.keys(typeMapping).includes(type))[0]}'`;
      }
      const validPrimary = schemaFields.filter(field => field.primary);
      if (validPrimary.length !== 1) {
        return 'schema must include 1 primary field';
      }
      const validPrimaryUnique = schemaFields.filter(field => (field.primary && 1) + (field.unique && 1) + (field.indexed && 1) > 1);
      if (validPrimaryUnique.length > 0) {
        return 'field may only be one of [primary, unique, indexed]';
      }
      return false;
    },
  };
  return utils;
};

module.exports = { getUtils };
