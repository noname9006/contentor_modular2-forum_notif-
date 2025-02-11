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
                logWithTimestamp(`Found existing URL: ${url} from author: ${existingUrl.author}`, 'INFO');
                
                // Check if the original poster is the same as current author
                if (existingUrl.author !== message.author.tag) {
                    // Different author - not allowed
                    const embed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle("Please don't try to use others content as your own")
                        .setDescription(`This content has already been shared by another user`)
                        .addFields(
                         { name: 'Original Message:', value: ` ` },
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
                        const embed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('You have posted this before')
                            .setDescription(`You have already shared this content`)
                            
                            .setFooter({
                                text: 'Botanix Labs',
                                iconURL: 'https://a-us.storyblok.com/f/1014909/512x512/026e26392f/dark_512-1.png'
                            })
                            .setTimestamp();

                        await message.reply({ embeds: [embed] });
                        logWithTimestamp(`Sent same-author different-thread notification for: ${url}`, 'INFO');
                    } else {
                        // Same thread - check if original message exists
                        const originalMessage = await message.channel.messages
                            .fetch(existingUrl.messageId)
                            .catch(() => null);

                        if (originalMessage) {
                            // Original message still exists
                            const embed = new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle('You have posted this before')
                                .setDescription(`You have already shared this content`)
                                
                                .setFooter({
                                    text: 'Botanix Labs',
                                    iconURL: 'https://a-us.storyblok.com/f/1014909/512x512/026e26392f/dark_512-1.png'
                                })
                                .setTimestamp();

                            await message.reply({ embeds: [embed] });
                            logWithTimestamp(`Sent same-thread notification for: ${url}`, 'INFO');
                        } else {
                            // Original message is gone - delete the entry
                            await this.urlStore.deleteUrl(url);
                            logWithTimestamp(`Deleted old URL entry as original message no longer exists: ${url}`, 'INFO');
                        }
                    }
                }
            }
        }
    } catch (error) {
        logWithTimestamp(`Error handling URL message: ${error.message}`, 'ERROR');
    }
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