const fs = require('fs').promises;
const path = require('path');
const { logWithTimestamp } = require('./utils');

class UrlStore {
    constructor() {
        this.dataFile = path.join(__dirname, 'url_data.json');
        this.data = {
            urls: []
        };
        this.initialized = false;
    }

    async init() {
        try {
            await this.loadData();
            this.initialized = true;
            logWithTimestamp('URL store initialized successfully', 'INFO');
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist yet, create it
                await this.saveData();
                this.initialized = true;
                logWithTimestamp('Created new URL store', 'INFO');
            } else {
                logWithTimestamp(`Error initializing URL store: ${error.message}`, 'ERROR');
                throw error;
            }
        }
    }

    async loadData() {
        const fileContent = await fs.readFile(this.dataFile, 'utf8');
        this.data = JSON.parse(fileContent);
    }

    async saveData() {
        await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
    }

    async addUrl(url, userId, channelId, threadId = null) {
        if (!this.initialized) await this.init();

        const urlEntry = {
            url,
            userId,
            channelId,
            threadId,
            timestamp: new Date().toISOString()
        };

        this.data.urls.push(urlEntry);
        await this.saveData();
        return urlEntry;
    }

    async findUrlHistory(url) {
        if (!this.initialized) await this.init();

        // Find the earliest instance of this URL
        return this.data.urls
            .filter(entry => entry.url === url)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
    }

    async fetchChannelUrls(channelId) {
        if (!this.initialized) await this.init();

        return this.data.urls
            .filter(entry => entry.channelId === channelId || entry.threadId === channelId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
}

module.exports = UrlStore;