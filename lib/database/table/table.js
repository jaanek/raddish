"use strict";

var Service     = require('../../service/service');
var Inflector   = require('../../inflector/inflector');
var util        = require('util');
var States      = new (require('../../model/states/states'))();

/**
 * Default table class
 *
 * @class Table
 * @constructor
 */
function Table(config) {
    Table.super_.call(this, config);

    this._identity_column   = undefined;
    this._column_map        = {};
}

util.inherits(Table, Service);

/**
 * Initialize function to initialize the Table model
 *
 * @method initialze
 * @param {Object|null} config Config object for the Table object
 * @returns {Promise} The initialized Table object
 */
Table.prototype.initialize = function (config) {
    var self = this;
    var extra = this.getComponentConfig(this.getIdentifier().getType() +'.' + this.getIdentifier().getName());

    this.db = config.db || extra.db || 'default';
    this.db_config = self.getConfig('db')[this.db];
    this.adapter = this.db_config.type || 'mysql';

    if (!config.behaviors && !extra.behaviors) {
        config.behaviors = {};
    } else if(!config.behaviors && extra.behaviors) {
        config.behaviors = extra.behaviors
    }

    if (config.identity_column) {
        this._identity_column = config.identity_column;
    }

    self._column_map = config.column_map || {};

    return Table.super_.prototype.initialize.call(self, config)
        .then(function (table) {
            self.name = (self.db_config.prefix || '') +
                (config.name || extra.name || self.getIdentifier().getComponent() + '_' + Inflector.pluralize(self.getIdentifier().getName()));

            return self.getSchema();
        })
        .then(function (schema) {
            // Now we will set the identity column.
            return self.getIdentityColumn();
        })
        .then(function (identity_column) {
            self._identity_column = identity_column;

            if (!self._column_map.id && self._identity_column) {
                self._column_map.id = self._identity_column;
            }

            return self;
        });
};

/**
 * This function returns the name of the table.
 *
 * @returns {string} Table name
 */
Table.prototype.getName = function () {
    return this.name;
};

/**
 * This function tries to get get a row or rowset from the table.
 *
 * @param {String} query
 * @param {Int} mode Mode to get from the table.
 * @returns {Promise} The data requested from the database.
 */
Table.prototype.select = function (query, mode) {
    var self = this;
    var localChain = undefined;

    var context = {};
    context.data = undefined;
    context.table = this.getName();
    context.query = query;

    return this.getCommandChain()
        .then(function (chain) {
            return [self.getAdapter(), chain.run('before.select', context), chain];
        })
        .spread(function (adapter, context, chain) {
            localChain = chain;

            return adapter.execute(context.query);
        })
        .then(function (data) {
            if (mode === 1) {
                return self.mapColumns(data[0], true);
            } else if (mode === 2) {
                for (var index in data) {
                    data[index] = self.mapColumns(data[index], true);
                }

                return data;
            }
        })
        .then(function(data) {
            context.data = data;

            return localChain.run('after.select', context);
        })
        .then(function (context) {
            if (mode === 1) {
                return [self.getRow(), context.data];
            } else if (mode === 2) {
                return [self.getRowset(), context.data];
            }
        })
        .spread(function (object, data) {
            return object.setData(data);
        })
        .then(function (object) {
            return object;
        });
};

/**
 * This function will try to insert a row in the database
 *
 * @method insert
 * @param {String} query The query string for the database
 * @return {Promise} The inserted data
 */
Table.prototype.insert = function (row) {
    var self = this;

    var context = {};
    context.data = row;
    context.table = this.getName();
    context.query = undefined;

    return this.getCommandChain()
        .then(function(chain) {
            return [self.getQuery(), chain.run('before.insert', context), chain, self.getColumns(), self.getAdapter()];
        })
        .spread(function(query, context, chain, columns, adapter) {
            var query = query.insert();
            query.table(context.table);

            for(var index in columns) {
                var filter = States.getFilter(columns[index].type);

                if(!filter.validate(context.data.data[index])) {
                    context.data.data[index] = filter.sanitize(context.data.data[index]);
                }
            }

            for(var index in columns) {
                if(!columns[index].autoinc && (adapter.strictColumns ? context.data.data[index] : true)) {
                    query.set((adapter.strictColumns ? columns[index].name : index), context.data.data[index]);
                }
            }

            context.query = query;

            return [self.getAdapter(), context, chain];
        })
        .spread(function(adapter, context, chain) {
            return [adapter.execute(context.query), chain, context];
        })
        .spread(function(result, chain, context) {
            context.data.data.id = result.insertId;

            return chain.run('after.insert', context);
        });
};

/**
 * This function will try to update a row in the database
 *
 * @method update
 * @param {String} query The query string for the database
 * @return {Promise} The updated data
 */
Table.prototype.update = function (row) {
    var self = this;

    var context = {};
    context.data = row;
    context.table = this.getName();
    context.query = undefined;

    return this.getCommandChain()
        .then(function(chain) {
            return [self.getQuery(), chain.run('before.update', context), chain, self.getColumns(), self.getAdapter()];
        })
        .spread(function(query, context, chain, columns, adapter) {
            var query = query.update();
            query.table(context.table);

            for(var index in columns) {
                var filter = States.getFilter(columns[index].type);

                if(!filter.validate(context.data.data[index])) {
                    context.data.data[index] = filter.sanitize(context.data.data[index]);
                }

                if(!columns[index].autoinc && (adapter.strictColumns ? context.data.data[index] : true)) {
                    query.set((adapter.strictColumns ? columns[index].name : index), context.data.data[index]);
                }
            }

            for(var index in columns) {
                if(columns[index].unique) {
                    query.where(columns[index].name, '=', context.data.data[index]);
                }
            }

            context.query = query;

            return [self.getAdapter(), context, chain];
        })
        .spread(function(adapter, context, chain) {
            return [adapter.execute(context.query), chain, context];
        })
        .spread(function(result, chain, context) {
            return chain.run('after.update', context);
        });
};

/**
 * This function will try to delete a row in the database
 *
 * @method delete
 * @param {String} query The query string for the database
 * @return {Promise} The deleted data
 */
Table.prototype.delete = function (row) {
    var self = this;

    var context = {};
    context.data = row;
    context.table = this.getName();
    context.query = undefined;

    return this.getCommandChain()
        .then(function(chain) {
            return [self.getQuery(), chain.run('before.delete', context), chain, self.getUniqueColumns()];
        })
        .spread(function(query, context, chain, columns) {
            var query = query.delete();
            query.table(context.table);

            for(var index in columns) {
                query.where(columns[index].name, '=', context.data.data[index]);
            }

            context.query = query;

            return [self.getAdapter(), context, chain];
        })
        .spread(function(adapter, context, chain) {
            return [adapter.execute(context.query), chain, context];
        })
        .spread(function(result, chain, context) {
            return chain.run('after.delete', context);
        });
};

/**
 * This function will check if the database is connected,
 * if it is it will return the connection
 *
 * @method isConnected
 * @returns {Promise} The connection for the database
 */
Table.prototype.isConnected = function () {
    var self = this;

    return self.getAdapter();
};

Table.prototype.getAdapter = function() {
    var self = this;
    var identifier = this.getIdentifier().clone();

    return this.getService(identifier.setPath(['database', 'adapter']).setName(this.adapter))
        .then(function(adapter) {
            return adapter.getInstance(self.db, self.db_config);
        });
};

/**
 * This function will return an empty Row object
 * Here we will also cache the Row object for later use.
 *
 * @method getRow
 * @returns {Promise} Returns a Row object
 */
Table.prototype.getRow = function () {
    var self = this;
    var identifier = this.getIdentifier().clone();

    return self.getService(identifier.setPath(['database', 'row']), {
        table: self
    });
};

/**
 * This function will return an empty Rowset object
 *
 * @method getRowset
 * @returns {Promise} Returns a Rowset object
 */
Table.prototype.getRowset = function (callback) {
    var self = this;
    var identifier = this.getIdentifier().clone();

    return this.getService(identifier.setPath(['database', 'rowset']), {
        table: self
    });
};

/**
 * Returns all the columns of the table
 *
 * @method getColumns
 * @returns {Promise} The columns of the table.
 */
Table.prototype.getColumns = function () {
    var self = this;
    var result = {};

    return this.getAdapter()
        .then(function(adapter) {
            return adapter.getSchema(self.getName())
        })
        .then(function(schema) {
            schema.columns = self.mapColumns(schema.columns, true);

            return schema.columns;
        });
};

/**
 * This function will return the unique columns of the table
 *
 * @method getUniqueColumns
 * @returns {Promise} The unique columns of the table.
 */
Table.prototype.getUniqueColumns = function () {
    var self = this;
    var fields = {};

    return self.getColumns()
        .then(function(columns) {
            for(var index in columns) {
                if(columns[index] && columns[index].unique) {
                    fields[index] = columns[index];
                }
            }

            return fields;
        });
};

/**
 * This function will return the single identity column, identified by the auto_increment value.
 *
 * @method getIdentityColumn
 * @returns {*}
 */
Table.prototype.getIdentityColumn = function() {
    var self = this;

    if(self._identity_column) {
        return self._identity_column;
    }

    return self.getUniqueColumns()
        .then(function(columns) {
            // There is only one column with auto_increment
            for(var index in columns) {
                if(columns[index].autoinc) {
                    return columns[index].name;
                }
            }
        });
};

/**
 * This function will check if the table exists or not, if not, it will return an error.
 *
 * @method getSchema.
 * @returns {*}
 */
Table.prototype.getSchema = function() {
    var self = this;

    return self.getAdapter()
        .then(function(adapter) {
            return adapter.getSchema(self.getName());
        });
};

/**
 * The getQuery function returns the query received from the adapter (default: mysql).
 *
 * @method getQuery
 * @returns {Object} The queryBuilder object.
 */
Table.prototype.getQuery = function() {
    return this.getAdapter()
        .then(function(adapter) {
            return adapter.getQuery();
        });
};

/**
 * This function will translate table columns to their original values, or visa versa.
 * This will work on the column_map variable.
 *
 * @param object
 */
Table.prototype.mapColumns = function(object, reverse) {
    var map = reverse ? array_flip(this._column_map) : this._column_map;

    if(object instanceof Object) {
        for(var index in object) {
            if(map[index]) {
                object[map[index]] = object[index];
                delete object[index];
            }
        }
    }

    return object;
};

function array_flip(trans) {
    var key, tmp_ar = {};

    if (trans && typeof trans === 'object' && trans.change_key_case) {
        return trans.flip();
    }

    for (key in trans) {
        if (!trans.hasOwnProperty(key)) {
            continue;
        }
        tmp_ar[trans[key]] = key;
    }

    return tmp_ar;
}

module.exports = Table;
