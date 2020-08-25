const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const keys = require('../config/keys');

const redisClient = redis.createClient({
    url: keys.redisUrl,
    // expire: 5
});
redisClient.flushall();
redisClient.hget = util.promisify(redisClient.hget);

console.log(`
  connecting redis
`);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = async function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
}

mongoose.Query.prototype.exec = async function() {
  console.log('making a query');
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    })
  )
  console.log('this.getQuery()', this.getQuery(), this.mongooseCollection.name)
  const cached = await redisClient.hget(this.hashKey, key);
  if (cached) {
    console.log('return from cache');
    const doc = JSON.parse(cached);
    return Array.isArray(doc)
        ? doc.map(d => new this.model(d))
        : new this.model(doc);
  }
  console.log('return from mongodb');
  const result = await exec.apply(this, arguments);
  redisClient.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);
  return result;
}

module.exports = {
    clearHash(key) {
        redisClient.del(JSON.stringify(key));
    }
}