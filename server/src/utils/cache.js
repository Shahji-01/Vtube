import NodeCache from 'node-cache'

// StdTTL: 300s (5 minutes), checkperiod: 60s
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

/**
 * Cache middleware generator
 * @param {number} duration - TTL in seconds
 */
export const cacheMiddleware = (duration) => (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
        return next()
    }

    const key = req.originalUrl || req.url
    const cachedResponse = cache.get(key)

    if (cachedResponse) {
        console.log(`[Cache Hit] Key: ${key}`)
        return res.status(200).json(cachedResponse)
    } else {
        console.log(`[Cache Miss] Key: ${key}`)
        
        // Proxy res.json to intercept and cache the response
        const originalJson = res.json;
        res.json = (body) => {
            cache.set(key, body, duration)
            return originalJson.call(res, body)
        }
        next()
    }
}

export const clearCache = (key) => {
    if (key) cache.del(key)
    else cache.flushAll()
}

export default cache
