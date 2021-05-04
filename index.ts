import { config } from 'dotenv';
import { Client, Message } from 'discord.js';
import { Octokit } from '@octokit/rest';

config();

const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.login(process.env.DISCORD_TOKEN);

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN!
});

const formUsers = new Set<string>();

client.on('ready', () => {
    console.log(`Ready to serve ${client.users.cache.size} users in ${client.guilds.cache.size} servers ✅`)
});

client.on('messageReactionAdd', async (reaction, user) => {

    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.channel.id !== process.env.DISCORD_REPORT_CHANNEL) return;
    if (reaction.emoji.name !== '🐱') return;

    const member = await reaction.message.guild?.members.fetch(user.id).catch(() => {});
    if (!member || !member.permissions.has('MANAGE_MESSAGES')) return;

    formUsers.add(user.id);

    const confirmationMessage = await reaction.message.channel.send(`${user.toString()}, voulez-vous vraiment convertir ce message en issue sur GitHub ? Si oui, entrez le nom que vous souhaitez attribuer à l'issue. Pour annuler, envoyez simplement \`non\`!`);

    const collector = reaction.message.channel.createMessageCollector((message) => message.author.id === user.id, {
        time: 60000
    });

    collector.on('collect', (message: Message) => {

        confirmationMessage.delete();
        message.delete();
        collector.stop();

        if (message.content === 'non') {
            reaction.users.remove(user.id);
            message.reply('action annulée ✅').then((m: Message) => {
                setTimeout(() => m.delete(), 10000);
            });
        } else {
            reaction.message.reactions.removeAll();
            const imageAttachments = reaction.message.attachments.filter((att) => ['jpg', 'png', 'webp', 'gif'].some((ext) => att.url.endsWith(`.${ext}`)));
            octokit.issues.create({
                owner: process.env.GITHUB_REPO_OWNER!,
                repo: process.env.GITHUB_REPO_NAME!,
                body: `🤖 Cette issue a été ouverte depuis un message sur Discord ${reaction.message.url}\n\n${reaction.message.content}${imageAttachments.size > 0 ? `\n\n${imageAttachments.map((att) => `![${att.name}](${att.url})`)}` : ''}`,
                title: message.content,
                labels: ['bug']
            }).then((issue) => {
                message.reply(`issue créée ${issue.data.url} ✅`).then((m: Message) => {
                    setTimeout(() => m.delete(), 10000);
                });
            });
        }
    });

    collector.on('end', (collected, reason) => {
        formUsers.delete(user.id);
        if (reason === 'time') {
            confirmationMessage.delete();
            reaction.users.remove(user.id);
            reaction.message.channel.send(`${user.toString()}, action annulée ⏲️`).then((m: Message) => {
                setTimeout(() => m.delete(), 10000);
            });
        }
    });

});

client.on('message', (message) => {

    if (message.channel.id !== process.env.DISCORD_REPORT_CHANNEL) return;
    if (message.author.bot) return;
    
    const isReplying = formUsers.has(message.author.id);
    if (isReplying) return;

    message.react('🐱');

});
