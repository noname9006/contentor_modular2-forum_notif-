const { EmbedBuilder } = require('discord.js');
const UrlStore = require('./urlStore');
const { logWithTimestamp } = require('./utils');

class UrlTracker {
    constructor(client) {
        this.client = client;
        this.store = new UrlStore();
        this.urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    }

    async init() {
        // Initialize the store
        await this.store.init();

        // Bind message handler
        this.client.on('messageCreate', this.handleMessage.bind(this));

        // Handle command for fetching links
        this.client.on('messageCreate', this.handleCommand.bind(this));

        // Validate environment variables
        this.validateEnv();
    }

    validateEnv() {
        const requiredVars = ['MAIN_CHANNEL_ID', 'URL_REPOST_THRESHOLD_HOURS'];
        const missing = requiredVars.filter(v => !process.env[v]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Validate threshold is a positive number
        const threshold = parseInt(process.env.URL_REPOST_THRESHOLD_HOURS);
        if (isNaN(threshold) || threshold <= 0) {
            throw new Error('URL_REPOST_THRESHOLD_HOURS must be a positive number');
        }
    }

    async handleMessage(message) {
        try {
            // Ignore bot messages and commands
            if (message.author.bot || message.content.startsWith('!')) return;

            // Check if message is in main channel or its threads
            if (message.channelId !== process.env.MAIN_CHANNEL_ID && 
                message.channel.parentId !== process.env.MAIN_CHANNEL_ID) {
                return;
            }

            // Extract URLs from message
            const urls = message.content.match(this.urlRegex);
            if (!urls) return;

            // Process each URL
            for (const url of urls) {
                await this.processUrl(url, message);
            }
        } catch (error) {
            logWithTimestamp(`Error handling message: ${error.message}`, 'ERROR');
        }
    }

    async processUrl(url, message) {
        try {
            // Check if URL exists in store
            const urlHistory = await this.store.findUrlHistory(url);
            
            if (urlHistory) {
                const postAge = this.getPostAgeHours(urlHistory.timestamp);
                const thresholdHours = parseInt(process.env.URL_REPOST_THRESHOLD_HOURS);

                // Changed condition: now checks if original post age is ABOVE threshold
                if (postAge > thresholdHours) {
                    // URL is old enough, allow repost but store the new instance
                    await this.store.addUrl(
                        url,
                        message.author.id,
                        message.channelId,
                        message.channel.isThread() ? message.channel.id : null
                    );
                    return;
                }

                // If we get here, the original post is still within threshold
                const isSameUser = urlHistory.userId === message.author.id;
                const embed = this.createRepostEmbed(urlHistory, message, postAge, isSameUser);
                await message.reply({ embeds: [embed] });

                // Optional: Delete the reposted message
                if (message.deletable) {
                    await message.delete();
                    logWithTimestamp(`Deleted reposted URL from ${message.author.tag}`, 'MODERATION');
                }
            } else {
                // First time this URL is posted
                await this.store.addUrl(
                    url,
                    message.author.id,
                    message.channelId,
                    message.channel.isThread() ? message.channel.id : null
                );
            }
        } catch (error) {
            logWithTimestamp(`Error processing URL: ${error.message}`, 'ERROR');
        }
    }

    createRepostEmbed(urlHistory, message, postAge, isSameUser) {
        return new EmbedBuilder()
            .setColor(isSameUser ? '#f2b518' : '#ff0000')
            .setTitle('URL Repost Detection')
            .setDescription(isSameUser 
                ? 'You have posted this link previously'
                : 'Please do not use other\'s content')
            .addFields(
                { 
                    name: 'Original Post', 
                    value: `Posted ${Math.floor(postAge)} hours ago` +
                           `\nTime remaining: ${Math.ceil(parseInt(process.env.URL_REPOST_THRESHOLD_HOURS) - postAge)} hours`
                }
            )
            .setFooter({
                text: 'Botanix Labs',
                iconURL: 'https://a-us.storyblok.com/f/1014909/512x512/026e26392f/dark_512-1.png'
            })
            .setTimestamp();
    }

    getPostAgeHours(timestamp) {
        const postDate = new Date(timestamp);
        const now = new Date();
        return (now - postDate) / (1000 * 60 * 60); // Convert to hours
    }

    async handleCommand(message) {
        if (!message.content.startsWith('!fetch links')) return;

        try {
            const args = message.content.split(' ');
            if (args.length !== 3) {
                await message.reply('Usage: !fetch links <channel_id>');
                return;
            }

            const channelId = args[2];
            const urls = await this.store.fetchChannelUrls(channelId);

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('URL History')
                .setDescription(`Found ${urls.length} URLs in channel`)
                .addFields(
                    urls.slice(0, 10).map(url => ({
                        name: new Date(url.timestamp).toLocaleString(),
                        value: `${url.url.substring(0, 100)}${url.url.length > 100 ? '...' : ''}`
                    }))
                )
                .setFooter({
                    text: `Showing first 10 of ${urls.length} URLs`,
                    iconURL: 'https://a-us.storyblok.com/f/1014909/512x512/026e26392f/dark_512-1.png'
                });

            await message.reply({ embeds: [embed] });
        } catch (error) {
            logWithTimestamp(`Error handling fetch command: ${error.message}`, 'ERROR');
            await message.reply('An error occurred while fetching URLs');
        }
    }
}

module.exports = UrlTracker;