const _ = require('lodash');
const client = require('./db.client');
const schemaFilters = require('./schema.filters');
const RelationQuery = require('./relation.query');
const SqlCache = require('./sql.cache');

const cache = new SqlCache(10);

class Model {
  constructor() {}
}

const isModelSet = set => {
  const model = _.isArray(set) ? set[0] : set;
  return model instanceof Model;
};

const instanceMethods = {
  $whiteList(properties) {
    return _.pick(properties, Object.keys(this.Class.schema));
  },
  $prepareProps(properties) {
    return this.$whiteList(properties);
  },
  $getAt(fields, properties) { // eslint-disable-line class-methods-use-this
    return fields.map(function(field) {
      return typeof properties[field] === 'undefined' ? null : properties[field];
    });
  },
  json() {
    const schema = this.Class.getSchema();
    return Object.assign({},
      _.pickBy(this, (value, prop) => !prop.match(/\$|_/) && !_.isFunction(value)),
      schema.reduce(schemaFilters.filterJSON(this), {})
    );
  },
  $afterFind() {
    const schema = this.Class.getSchema();
    schema.map(schemaFilters.filterOut(this));
  },
  afterFind() { // eslint-disable-line class-methods-use-this

  },
  $beforeSave(props) {
    const schema = this.Class.getSchema();
    if (this.Class.tracked) {
      props.updated = new Date();
    }
    const filter = schemaFilters.filterIn(props);
    return _(Object.keys(props))
      .map(prop => schema.find(field => field.name === prop))
      .map(filter)
      .fromPairs()
      .value();
  },
  beforeSave(props) {
    return props;
  },
  refreshRelations(propKeys) {
    const relationFields = this.Class.getSchema().filter(field => field.relation);
    const modifiedRelations = _.intersection(relationFields.map(field => field.column), propKeys);
    if (modifiedRelations.length) {
      const relations = modifiedRelations.map(column => _.find(relationFields, { column })).map(({ relation }) => this.Class.getModel(relation));
      return Promise.all(relations.map(relation => new RelationQuery(this, relation).exec()));
    }
  },
  async update(props, transactionQuery = null) {
    const query = transactionQuery || this.Class.$transactionQuery || client.query;
    const properties = await this.beforeSave(_.extend({}, props));
    let whiteListedProperties = this.$prepareProps(properties);
    whiteListedProperties = this.$beforeSave(whiteListedProperties);
    const loadedRelationsProps = Object.keys(whiteListedProperties).filter(key => isModelSet(this[key]));

    if (_.size(whiteListedProperties)) {
      await query("UPDATE ?? SET ? WHERE ?? = ?", [
        this.$tableName,
        whiteListedProperties,
        this.$primaryKey,
        this[this.$primaryKey],
      ]);
      this.Class.cache.invalidate();
      _.extend(this, whiteListedProperties);
      this.$afterFind();
      await this.refreshRelations(loadedRelationsProps);
      this.afterFind();
    }
    return this;
  },
  async $saveParams(setColumns = null) {
    const properties = await this.beforeSave(this);
    let whiteListedProperties = this.$prepareProps(properties);
    whiteListedProperties = this.$beforeSave(whiteListedProperties);
    const columns = setColumns || _.keys(whiteListedProperties);
    const values = this.$getAt(columns, whiteListedProperties);
    return { columns, values, whiteListedProperties };
  },
  async save(transactionQuery = null) {
    const query = transactionQuery || this.Class.$transactionQuery || client.query;
    const params = await this.$saveParams();
    const { values, whiteListedProperties } = params;
    let { columns } = params;
    let sql = 'INSERT INTO ?? (??) VALUES ';
    if (columns.length) {
      sql += '(?)';
      if (columns.includes(this.$primaryKey)) {
        sql += 'ON DUPLICATE KEY UPDATE ?';
      }
    } else {
      columns = this.Class.getDefaultSchemaFields();
      sql += `(${columns.map(() => 'NULL').join(', ')})`;
    }
    const data = await query(sql, [
      this.$tableName,
      columns,
      values,
      whiteListedProperties,
    ]);
    this.Class.cache.invalidate();
    const model = await this.Class.find(data.insertId || this[this.$primaryKey]).exec();
    Object.assign(this, model);
    return this;
  },
  async delete(transactionQuery = null) {
    const query = transactionQuery || this.Class.$transactionQuery || client.query;
    await query("DELETE FROM ?? WHERE ?? = ?", [
      this.$tableName,
      this.$primaryKey,
      this[this.$primaryKey],
    ]);
    this.Class.cache.invalidate();
    return true;
  },
};

Object.assign(Model.prototype, instanceMethods);

const staticMethods = {
  async import(objects, transactionQuery = null) {
    const query = transactionQuery || this.$transactionQuery || client.query;
    const schema = this.getSchema();
    const columns = schema.map(field => field.column);
    const params = await Promise.all(objects.map(obj => {
      let record = obj;
      if (!(obj instanceof this)) {
         record = new this(obj);
      }
      return record.$saveParams(columns);
    }));
    const nonPrimaryColumns = schema.filter(f => !f.primary).map(field => field.column);
    const updateSyntax = nonPrimaryColumns.map(() => `?? = VALUES(??)`).join(', ');
    const sql = `INSERT INTO ?? (??) VALUES ? ${nonPrimaryColumns.length ? `ON DUPLICATE KEY UPDATE ${updateSyntax}` : ''}`;
    const injection = [
      this.tableName,
      columns,
      params.map(({ values }) => values),
      ...nonPrimaryColumns.reduce((memo, column) => memo.concat([column, column]), []),
    ];
    await query(sql, injection);
    this.cache.invalidate();
  },
  async update(recordId, props, transactionQuery = null) {
    const query = transactionQuery || this.$transactionQuery || client.query;
    const initialProps = {
      [this.$getPrimaryKey()]: recordId,
    };
    const pseudoModel = new this(initialProps);
    const properties = pseudoModel.beforeSave(_.extend({}, props));
    let whiteListedProperties = pseudoModel.$prepareProps(properties);
    whiteListedProperties = pseudoModel.$beforeSave(whiteListedProperties);

    if (_.size(whiteListedProperties)) {
      await query("UPDATE ?? SET ? WHERE ?? = ?", [
        pseudoModel.$tableName,
        whiteListedProperties,
        this.$getPrimaryKey(),
        recordId,
      ]);
      this.cache.invalidate();
    }
    return true;
  },
};

Object.assign(Model, staticMethods, {
  cache,
});

module.exports = {
  Model,
  staticMethods,
  instanceMethods,
  isModelSet,
};
