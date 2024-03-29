"use strict";

var AbstractAdapter = require('./abstract');
var util            = require('util');
var query           = require('../query/query');
var mysql           = require('mysql');
var instances       = {};

/**
 * The MysqlAdapter is the default adapter in this framework,
 * this sets the queryBuilder object with the "squel" module which is a query builder for mysql.
 * @constructor
 */
function MysqlAdapter(config, connection) {
    MysqlAdapter.super_.call(this, config);
    this.connection = connection;

    // Set the types.
    this.types = {
        'int':      'int',
        'integer':  'int',
        'bigint':   'int',
        'varchar':  'string',
        'text':     'string',
        'tinyint':  'int',
        'datetime': 'time',
        'date':     'date'
    };

    this.queryBuilder = query.getType('mysql');
}

util.inherits(MysqlAdapter, AbstractAdapter);

/**
 * This function will return an instance of the mysql connection,
 * If there is a problem with the connection an error will be thrown.
 *
 * @method getInstance
 * @param name
 * @param config
 * @returns {Object} A resolved promise with the connection.
 */
MysqlAdapter.prototype.getInstance = function(name, config) {
    var self = this;

    if (instances[name]) {
        return Promise.resolve(instances[name]);
    } else {
        var connection = mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database,
            port: config.port || 3306
        });

        // Save the instance in the cache.
        var conn = Promise.promisifyAll(connection);

        return conn.connectAsync()
            .then(function(connection) {
                instances[name] = new MysqlAdapter({
                    identifier: self.getIdentifier()
                }, conn);

                return instances[name];
            })
            .catch(function(error) {
                throw new RaddishError(500, error.message);
            });
    }
};

MysqlAdapter.prototype.execute = function(query) {
    return this.connection.queryAsync(query.toQuery())
        .then(function(data) {
            return data[0];
        });
};

MysqlAdapter.prototype.getSchema = function(name) {
    var result = {};
    var self = this;

    return this._fetchInfo(name)
        .then(function(info) {
            result.info = info;

            return self._fetchIndexes(name);
        })
        .then(function(indexes) {
            result.indexes = indexes;

            return self._fetchColumns(name);
        })
        .then(function(columns) {
            result.columns = columns;

            return result;
        });

};

MysqlAdapter.prototype._fetchInfo = function(name) {
    var self = this;
    var table = '\'' + name + '\'';

    return this.connection.queryAsync('SHOW TABLE STATUS LIKE ' + table)
        .then(function(result) {
            result = result[0][0];

            return {
                name: result.Name,
                engine: result.Engine,
                type: result.Comment == 'VIEW' ? 'VIEW' : 'BASE',
                length: result.Data_length,
                autoinc: result.Auto_increment,
                collation: result.collation,
                description: result.Comment != 'VIEW' ? result.Comment : ''
            };
        });
};

MysqlAdapter.prototype._fetchIndexes = function(name) {
    return this.connection.queryAsync('SHOW INDEX FROM `' + name + '`')
        .then(function(result) {
            var result = {};
            var indexes = result[0];

            for(var index in indexes) {
                var indx = indexes[index];

                result[indx.Key_name][indx.Seq_in_index] = indx;
            }

            return result;
        });
};

MysqlAdapter.prototype._fetchColumns = function(name) {
    var self = this;

    return this.connection.queryAsync('SHOW COLUMNS FROM ' + name)
        .then(function(rows) {
            var result = {};

            for(var index in rows[0]) {
                result[rows[0][index].Field] = {
                    name: rows[0][index].Field,
                    unique: (rows[0][index].Key == 'PRI' || rows[0][index].Key == 'UNI') ? 1 : 0,
                    autoinc: (rows[0][index].Extra.indexOf('auto_increment') != -1) ? 1 : 0,
                    value: rows[0][index].Default,
                    type: self.getType(rows[0][index].Type)
                };
            }

            return result;
        });
};

MysqlAdapter.prototype.getType = function(type) {
    type = type.toLowerCase();

    if(type.indexOf('(') > -1) {
        type = type.split('(')[0];
    }

    return this.types[type];
};

module.exports = MysqlAdapter;