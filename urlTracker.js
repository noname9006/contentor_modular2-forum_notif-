const { EmbedBuilder, ChannelType } = require('discord.js');
const UrlStorage = require('./urlStore');
const { logWithTimestamp } = require('./utils');
const { DB_TIMEOUT } = require('./config');

class UrlTracker {
    constructor(client) {
        this.client = client;
        this.urlStore = new UrlStorage();
        this.urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    }

    async init() {
        try {
            await this.urlStore.init();
            logWithTimestamp('URL Tracker initialized successfully', 'INFO');
        } catch (error) {
            logWithTimestamp(`Failed to initialize URL Tracker: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    async handleUrlMessage(message, urls) {
        try {
            for (const url of urls) {
                logWithTimestamp(`Checking URL: ${url}`, 'INFO');
                const existingUrl = await this.urlStore.findUrlHistory(url);
                
                if (existingUrl) {
                    logWithTimestamp(`Found existing URL: ${url} from user ID: ${existingUrl.userId}`, 'INFO');
                    
                    // Check if the original message still exists
                    const originalChannel = await this.client.channels.fetch(existingUrl.channelId);
                    let originalMessageExists = false;
                    
                    if (originalChannel) {
                        try {
                            await originalChannel.messages.fetch(existingUrl.messageId);
                            originalMessageExists = true;
                        } catch (error) {
                            // Message doesn't exist anymore
                            logWithTimestamp(`Original message no longer exists, removing entry for URL: ${url}`, 'INFO');
                            await this.urlStore.deleteUrl(url);
                            // Continue processing as a new entry
                            originalMessageExists = false;
                        }
                    }

                    if (originalMessageExists) {
                        // Check if the original poster is the same as current author
                        if (existingUrl.userId !== message.author.id) {
                            // Different author - not allowed
                            const embed = new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle("Please don't try to use others content as your own")
                                .setDescription(`This content has already been shared by another user`)
                                .addFields(
                                    { name: 'Original Message:', value: existingUrl.messageUrl || 'Not available' }
                                )
                                .setFooter({
                                    text: 'Botanix Labs',
                                    iconURL: 'https://a-us.storyblok.com/f/1014909/512x512/026e26392f/dark_512-1.png'
                                })
                                .setTimestamp();

                            await message.reply({ embeds: [embed] });
                            logWithTimestamp(`Sent duplicate URL notification for: ${url}`, 'INFO');
                        } else {
                            // Same author - check if same thread
                            if (existingUrl.channelId !== message.channel.id) {
                                // Different thread
                                const embed = createDuplicateEmbed('You have posted this before', 'You have already shared this content');
                                await message.reply({ embeds: [embed] });
                                logWithTimestamp(`Sent same-author different-thread notification for: ${url}`, 'INFO');
                            }
                        }
                    } else {
                        // Original message is gone - add new entry
                        await this.addNewUrlEntry(message, url);
                    }
                } else {
                    // New URL - add entry
                    await this.addNewUrlEntry(message, url);
                }
            }
        } catch (error) {
            logWithTimestamp(`Error handling URL message: ${error.message}`, 'ERROR');
        }
    }

    async addNewUrlEntry(message, url) {
        const messageUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
        await this.urlStore.addUrl(
            url,
            message.author.id,
            message.channel.id,
            message.channel.isThread() ? message.channel.id : null,
            message.id,
            messageUrl
        );
        logWithTimestamp(`Added new URL entry: ${url} from user ID ${message.author.id}`, 'INFO');
    }
    

    async fetchAllUrlsFromChannel(channelId) {
        const channel = await this.client.channels.fetch(channelId).catch(error => {
            logWithTimestamp(`Failed to fetch channel: ${error.message}`, 'ERROR');
            return null;
        });

        if (!channel) {
            logWithTimestamp(`Channel not found: ${channelId}`, 'ERROR');
            return [];
        }

        let urls = [];
        try {
            if (channel.type === ChannelType.GuildForum) {
                const threads = await channel.threads.fetch();
                
                for (const [threadId, thread] of threads.threads) {
                    const messages = await thread.messages.fetch({ limit: 100 });
                    
                    messages.forEach(message => {
                        const foundUrls = message.content.match(this.urlRegex);
                        if (foundUrls) {
                            foundUrls.forEach(url => {
                                urls.push({
                                    url,
                                    timestamp: message.createdTimestamp,
                                    author: message.author.tag,
                                    threadName: thread.name
                                });
                            });
                        }
                    });
                }
            } else {
                const messages = await channel.messages.fetch({ limit: 100 });
                
                messages.forEach(message => {
                    const foundUrls = message.content.match(this.urlRegex);
                    if (foundUrls) {
                        foundUrls.forEach(url => {
                            urls.push({
                                url,
                                timestamp: message.createdTimestamp,
                                author: message.author.tag
                            });
                        });
                    }
                });
            }
        } catch (error) {
            logWithTimestamp(`Error fetching messages: ${error.message}`, 'ERROR');
            return [];
        }

        urls = urls.filter((url, index, self) =>
            index === self.findIndex((t) => t.url === url.url)
        );

        logWithTimestamp(`Fetched ${urls.length} unique URLs from channel ${channelId}`, 'INFO');
        return urls;
    }

    shutdown() {
        logWithTimestamp('URL Tracker shutting down...', 'SHUTDOWN');
        this.urlStore.shutdown();
    }
}

module.exports = UrlTracker;