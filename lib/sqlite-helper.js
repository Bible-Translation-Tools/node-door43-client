'use strict';

let path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    SQL = require('sql.js'),
    _ = require('lodash');

/**
 * A SQLite database helper.
 *
 * @param schemaPath {string}
 * @param dbPath {string}
 * @constructor
 */
function SQLiteHelper (schemaPath, dbPath) {

    let dbFilePath = dbPath,
        dbDirPath = path.dirname(dbFilePath),
        sql,
        inTransaction = false;

    // Prepared statements by query text. Compiling a statement for every
    // row was much of the time an update took.
    const statements = new Map();

    /**
     * Frees the cached statements. sql.js frees them itself on export(), and
     * a vacuum makes them stale.
     */
    function forgetStatements () {
        for (let stmt of statements.values()) {
            stmt.free();
        }
        statements.clear();
    }

    /**
     * Returns the prepared statement for a query, compiling it once.
     *
     * @param query {string}
     * @returns {Statement}
     */
    function prepared (query) {
        let stmt = statements.get(query);
        if (!stmt) {
            stmt = sql.prepare(query);
            statements.set(query, stmt);
        }
        return stmt;
    }

    /**
     * Changes are made in one transaction, committed when the database is
     * saved: committing every statement on its own was the rest of the time.
     */
    function begin () {
        if (!inTransaction) {
            sql.run('BEGIN');
            inTransaction = true;
        }
    }

    function commit () {
        if (inTransaction) {
            sql.run('COMMIT');
            inTransaction = false;
        }
    }

    /**
     * Saves a sql database to the disk.
     *
     * @param sql {Database}
     */
    function saveDB (sql) {
        commit();
        // export() frees every prepared statement
        statements.clear();
        let data = sql.export();
        let buffer = new Buffer(data);

        mkdirp.sync(dbDirPath, '0755');
        fs.writeFileSync(dbFilePath, buffer);
    }

    /**
     * Prefixes object params with ':'.
     * If something other than an object is given the will be returned without being changed.
     *
     * @param params {[]|{}|string}
     * @returns {*} returns the updated params object
     */
    function normalizeParams(params) {
        if (params && params.constructor !== Array && typeof params === 'object') {
            params = _.mapKeys(params, function (value, key) {
                return ':' + _.trimStart(key, ':');
            });
        }
        return params;
    }

    /**
     * Executes a command returning the results.
     *
     * @param query {string} the query string
     * @param params {[]|{}} the parameters to be bound to the query
     * @returns {[]} an array of rows
     */
    function query (query, params) {
        let rows = [];
        let stmt = prepared(query);
        params = normalizeParams(params);
        stmt.bind(params);
        while(stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.reset();
        return rows;
    }

    /**
     * Executes a command ignoring the results.
     *
     * @param query {string} the run string
     * @param params {[]|{}} the parameters to be bound to the query
     */
    function run(query, params) {
        if (/^\s*vacuum\b/i.test(query)) {
            // vacuum cannot run inside a transaction, and it changes the
            // schema the cached statements were compiled against
            commit();
            forgetStatements();
            sql.run(query);
            return;
        }
        begin();
        let stmt = prepared(query);
        params = normalizeParams(params);
        stmt.run(params);
        stmt.reset();
    }

    if (!fs.existsSync(dbFilePath)) {
        let schema = fs.readFileSync(schemaPath);

        sql = new SQL.Database();
        sql.run(schema);

        saveDB(sql);
    } else {
        let buffer = fs.readFileSync(dbFilePath);

        sql = new SQL.Database(buffer);
    }
    
    return {query: query, save: saveDB.bind(null, sql), run: run};
}

module.exports = SQLiteHelper;
