const fs = require('fs').promises;
const path = require('path');
const { logWithTimestamp } = require('./utils');

class UrlStorage {
    constructor() {
        this.urls = new Map();
        this.storageFile = '';
        this.isInitialized = false;
    }

    async init() {
        try {
            const mainChannelId = process.env.MAIN_CHANNEL_ID;
            if (!mainChannelId) {
                throw new Error('MAIN_CHANNEL_ID environment variable is not set');
            }

            this.storageFile = path.join(__dirname, `URL_DB_${mainChannelId}.json`);
            
            const data = await fs.readFile(this.storageFile, 'utf8').catch(() => '{}');
            const urlData = JSON.parse(data);
            
            for (const [channelId, urls] of Object.entries(urlData)) {
                this.urls.set(channelId, urls);
            }
            
            this.isInitialized = true;
            logWithTimestamp('URL storage initialized', 'STARTUP');
        } catch (error) {
            logWithTimestamp(`Error initializing URL storage: ${error.message}`, 'ERROR');
            this.urls = new Map();
            this.isInitialized = false;
        }
    }

    // Helper method to check for duplicates across all channels
    isDuplicateUrl(url) {
        for (const urls of this.urls.values()) {
            if (urls.some(entry => entry.url.trim() === url.trim())) {
                return true;
            }
        }
        return false;
    }

    async findUrlHistory(url) {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return null;
        }

        const trimmedUrl = url.trim();
        for (const [channelId, urls] of this.urls.entries()) {
            const foundUrl = urls.find(entry => entry.url.trim() === trimmedUrl);
            if (foundUrl) {
                logWithTimestamp(`URL history found for: ${url} in channel ${channelId}`, 'INFO');
                return {
                    ...foundUrl,
                    channelId
                };
            }
        }

        logWithTimestamp(`No URL history found for: ${url}`, 'INFO');
        return null;
    }

    async saveUrls(channelId, newUrls) {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return 0;
        }

        try {
            const existingUrls = this.urls.get(channelId) || [];
            const updatedUrls = [...existingUrls];
            let addedCount = 0;

            for (const newUrl of newUrls) {
                if (!this.isDuplicateUrl(newUrl.url)) {
                    updatedUrls.push({
                        ...newUrl,
                        url: newUrl.url.trim(),
                        messageUrl: newUrl.messageUrl, // Add message URL
                        userId: newUrl.userId, // Store user ID instead of username
                        messageId: newUrl.messageId
                    });
                    logWithTimestamp(`Added new URL: ${newUrl.url}`, 'INFO');
                    addedCount++;
                } else {
                    logWithTimestamp(`Skipped duplicate URL: ${newUrl.url}`, 'INFO');
                }
            }

            if (addedCount > 0) {
                updatedUrls.sort((a, b) => b.timestamp - a.timestamp);
                this.urls.set(channelId, updatedUrls);
                
                const urlData = Object.fromEntries(this.urls);
                await fs.writeFile(this.storageFile, JSON.stringify(urlData, null, 2));
                
                logWithTimestamp(`Saved ${addedCount} new URLs for channel ${channelId}`, 'INFO');
            }
            
            return addedCount;
        } catch (error) {
            logWithTimestamp(`Error saving URLs: ${error.message}`, 'ERROR');
            return 0;
        }
    }

    async addUrl(url, userId, channelId, threadId = null, messageId, messageUrl) {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return null;
        }

        const trimmedUrl = url.trim();
        if (this.isDuplicateUrl(trimmedUrl)) {
            logWithTimestamp(`Skipped duplicate URL: ${trimmedUrl}`, 'INFO');
            return null;
        }

        const urlEntry = {
            url: trimmedUrl,
            userId,
            channelId,
            threadId,
            messageId,
            messageUrl,
            timestamp: Date.now()
        };

        const addedCount = await this.saveUrls(channelId, [urlEntry]);
        if (addedCount > 0) {
            logWithTimestamp(`Added URL: ${trimmedUrl} by user ID ${userId}`, 'INFO');
            return urlEntry;
        }
        return null;
    }

    async deleteUrl(url) {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return false;
        }

        let deleted = false;
        for (const [channelId, urls] of this.urls.entries()) {
            const index = urls.findIndex(entry => entry.url.trim() === url.trim());
            if (index !== -1) {
                urls.splice(index, 1);
                const urlData = Object.fromEntries(this.urls);
                await fs.writeFile(this.storageFile, JSON.stringify(urlData, null, 2));
                deleted = true;
                logWithTimestamp(`Deleted URL: ${url}`, 'INFO');
                break;
            }
        }

        return deleted;
    }

    getUrls(channelId) {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return [];
        }
        return this.urls.get(channelId) || [];
    }

    async cleanup() {
        if (!this.isInitialized) {
            logWithTimestamp('URL storage not initialized', 'ERROR');
            return;
        }

        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        const now = Date.now();
        let totalRemoved = 0;

        for (const [channelId, urls] of this.urls.entries()) {
            const originalLength = urls.length;
            const filteredUrls = urls.filter(url => now - url.timestamp < maxAge);
            if (filteredUrls.length !== originalLength) {
                this.urls.set(channelId, filteredUrls);
                totalRemoved += originalLength - filteredUrls.length;
            }
        }

        if (totalRemoved > 0) {
            try {
                const urlData = Object.fromEntries(this.urls);
                await fs.writeFile(this.storageFile, JSON.stringify(urlData, null, 2));
                logWithTimestamp(`Cleaned up ${totalRemoved} old URLs`, 'INFO');
            } catch (error) {
                logWithTimestamp(`Error during URL cleanup: ${error.message}`, 'ERROR');
            }
        }
    }

    async getAllChannelIds() {
        return Array.from(this.urls.keys());
    }

    async getStats() {
        const stats = {
            totalUrls: 0,
            channelCount: this.urls.size,
            urlsPerChannel: {}
        };

        for (const [channelId, urls] of this.urls.entries()) {
            stats.totalUrls += urls.length;
            stats.urlsPerChannel[channelId] = urls.length;
        }

        return stats;
    }

0
    shutdown() {
        logWithTimestamp('URL storage shutting down', 'SHUTDOWN');
    }
}

module.exports = UrlStorage;