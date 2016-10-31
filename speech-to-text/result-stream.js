'use strict';

var PassThrough = require('stream').PassThrough;
var util = require('util');

/**
 * Helper PassThrough stream that collects and propagates errors from anywhere in the chain, and also propagates all RecognizeStream events
 * Propagates errors from all streams in the chain and all events from the ResultsStream.
 * Also provides a .promise() method to convert the stream into a promise.
 *
 * This stream is used by recognizeMicrophone and recognizeFile to provide access to internal errors and events.
 *
 * Sources must be added before event listeners.
 *
 * @param {Object} [options] - passed to PassThrough superclass to enable objectMode, etc.
 * @constructor
 */
function ResultStream(options) {
  PassThrough.call(this, options);

  this.errorSources = [];
  this.allEventSources = [];

  this.propagatedEvents = [];

  this.on('newListener', this.propagateEvent.bind(this));
}
util.inherits(ResultStream, PassThrough);


/**
 * Propogates error events from the sourceStream to this stream
 * @param {ReadableStream} sourceStream
 */
ResultStream.prototype.propagateErrorsFrom = function(sourceStream) {
  this.errorSources.push(sourceStream);
  if (this.propagatedEvents.indexOf('error') !== -1) {
    sourceStream.on('error', this.emit.bind(this, 'error'));
  }
};

/**
 * Propogates all events from the sourceStream to this stream.
 *
 * Note: this could cause events such as `close` to be emitted multiple times
 *
 * @param {ReadableStream} sourceStream
 */
ResultStream.prototype.propagateEventsFrom = function(sourceStream) {
  this.allEventSources.push(sourceStream);
  this.propagatedEvents.forEach(function(eventName) {
    sourceStream.on(eventName, this.emit.bind(this, eventName));
  }, this);
};

/**
 * Relays eventName events from all appropriate sources
 *
 * @private
 * @param {String} eventName
 */
ResultStream.prototype.propagateEvent = function(eventName) {
  // data and end are automatically propagated by node.js's underlying streams implementation
  if (eventName === 'data' || eventName === 'end') {
    return;
  }
  if (this.propagatedEvents.indexOf(eventName) === -1) {
    this.propagatedEvents.push(eventName);
    // errors use both sets of sources. anything else uses only the allEventSources
    var sources = eventName === 'error' ? this.errorSources.concat(this.allEventSources) : this.allEventSources;
    this.propagatedEvents.push(eventName);
    sources.forEach(function(source) {
      source.on(eventName, this.emit.bind(this, eventName));
    }, this);
  }
};

/**
* Helper method that can be bound to a stream - it sets the output to utf-8, captures all of the results, and returns a promise that resolves to the final text.
* Essentially a smaller version of concat-stream wrapped in a promise
*
* @param {Stream} [stream=] optional stream param for when not bound to an existing stream instance
* @return {Promise}
*/
ResultStream.prototype.promise = function promise(stream) {
  stream = stream || this;
  return new Promise(function(resolve, reject) {
    var results = [];
    stream.on('data', function(result) {
      results.push(result);
    }).on('end', function() {
      resolve(Buffer.isBuffer(results[0]) ? Buffer.concat(results).toString() : results);
    }).on('error', reject);
  });
};


module.exports = ResultStream;
