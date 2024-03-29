"use strict";

var RowAbstract = require('./abstract');
var util        = require('util');

/**
 * This class is a helper to structure data of the table,
 * this will only hold one table row.
 *
 * Also when extended the extra functions can be used.
 *
 * @class Row
 * @constructor
 */
function Row(config) {
    Row.super_.call(this, config);
}

util.inherits(Row, RowAbstract);

/**
 * This function will intialize the Row object.
 *
 * @method initialize
 * @param {Object} config The configuration of the Row object
 * @returns {Promise}
 */
Row.prototype.initialize = function (config) {
    var self = this;

    if (config.table) {
        this.table = config.table;
    }

    return Row.super_.prototype.initialize.call(self, config)
            .then(function(row) {
                return self.table.getColumns();
            })
            .then(function(columns) {
                return self.mapColumns(columns);
            });
};

/**
 * This function tries to save the object to the database,
 * when it is new the object is inerted into the database if it exists the row is updated.
 *
 * @method save
 * @returns {Promise} Returns the returned data.
 */
Row.prototype.save = function () {
    if(this.new) {
        return this.table.insert(this);
    } else {
        return this.table.update(this);
    }
};

/**
 * This function tries to remove an entity from the database.
 *
 * @method delete
 * @returns {Promise}
 */
Row.prototype.delete = function () {
    return this.table.delete(this);
};

/**
 * This function will map the table columns to the values of the row object.
 * Default table column values are supported.
 *
 * @method mapColumns
 * @param {Object} columns All the columns from the table.
 * @returns {Row} The current row object for chaining.
 */
Row.prototype.mapColumns = function(columns) {
    for(var index in columns) {
        this.data[index] = columns[index].value;
    }

    return this;
};

/**
 * This function will clone the object and return a new Row object.
 *
 * @method clone
 * @returns {Row}
 */
Row.prototype.clone = function() {
    return new Row({
        identifier: this.getIdentifier()
    });
}

module.exports = Row;