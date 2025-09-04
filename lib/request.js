var url = require('url');
var https = require('https');
var http = require('http');
var fs = require('fs');
var rimraf = require('rimraf');

const timeout = 30000;
const agentOptions = {
    keepAlive: true,
    timeout
};
var httpAgent = new http.Agent(agentOptions);
var httpsAgent = new https.Agent(agentOptions);

/**
 * Reads the contents of a url as a string.
 *
 * @param uri {string} the url to read
 * @param userAgent {string} custom user agent name
 * @returns {Promise.<string>} the url contents
 */
function read(uri, userAgent) {
    "use strict";
    var parsedUrl = url.parse(uri, false, true);
    var makeRequest = parsedUrl.protocol === 'https:' ? https.request.bind(https) : http.request.bind(http);
    var serverPort = parsedUrl.port ? parsedUrl.port : parsedUrl.protocol === 'https:' ? 443 : 80;
    var agent = parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;

    var options = {
        host: parsedUrl.host,
        path: parsedUrl.path,
        agent: agent,
        port: serverPort,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    };

    if (userAgent !== undefined) {
        options.headers['User-Agent'] = userAgent;
    }

    return new Promise(function (resolve, reject) {

        var req = makeRequest(options, function (response) {
            var data = '';

            response.on('data', function (chunk) {
                data += chunk;
            });

            response.on('end', function () {
                resolve({
                    status: response.statusCode,
                    data: data
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Downloads a url to a file.
 *
 * @param uri {string} the uri to download
 * @param dest {string}
 * @param userAgent {string} custom user agent name
 * @param progressCallback {function} receives progress updates
 * @returns {Promise.<{}|Error>} the status code or an error
 */
function download(uri, dest, userAgent, progressCallback) {
    "use strict";
    progressCallback = progressCallback || function() {};
    var parsedUrl = url.parse(uri, false, true);
    var makeRequest = parsedUrl.protocol === 'https:' ? https.request.bind(https) : http.request.bind(http);
    var serverPort = parsedUrl.port ? parsedUrl.port : parsedUrl.protocol === 'https:' ? 443 : 80;
    var agent = parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;
    var file = fs.createWriteStream(dest);

    var options = {
        host: parsedUrl.host,
        path: parsedUrl.path,
        agent: agent,
        port: serverPort,
        method: 'GET'
    };

    if (userAgent !== undefined) {
        options.headers['User-Agent'] = userAgent;
    }

    return new Promise(function (resolve, reject) {

        var req = makeRequest(options, function (response) {
            var size = response.headers['content-length'];
            var progress = 0;

            response.on('data', function(chunk) {
                progress += chunk.length;
                progressCallback(size, progress);
            });

            response.pipe(file);
            file.on('finish', function() {
                resolve({
                    status: response.statusCode
                });
            });
        });

        req.on('error', function(error) {
            file.end();
            rimraf.sync(dest);
            reject(error);
        });

        req.end();
    });
}

module.exports.read = read;
module.exports.download = download;
