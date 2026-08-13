'use strict';

async function handleInteraction(interaction, runtime) {
  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    getBinding,
    getCharacters,
    getAllCharacters,
    setCharacterEnabled,
    setDefaultCharacter,
    renameCharacterAlias,
    updateBinding,
    getCharacterDetail,
    getArchivedRaffleHistory,
    getManualSyncCooldown,
    markManualSync,
    getPartyById,
    listUserParties,
    createPartyV2,
    addPartyMemberV2,
    removePartyMemberV2,
    leavePartyV2,
    archivePartyV2,
    canManageParty,
    addPartyLayer,
    removePartyLayer,
    listPartyLayers,
    addKnownCharacterToParty,
    transferPartyLeader,
    updatePartyV2,
    loadKnownCharacters,
    getKnownCharacter,
    PT_BOSSES,
    PT_DIFFICULTIES,
    findCharacterByAlias,
    getDefaultCharacter,
    findCharacterByAssetKey,
    verifyOwner,
    buildHomePayload,
    buildPartyHomePayload,
    buildPartyBossPayload,
    buildPartyLayerPayload,
    buildPartyViewPayload,
    buildPartyCharacterPayload,
    buildPartyCreateLayerPayload,
    buildPartyCreateSourcePayload,
    showPartyRaffleDateModal,
    buildRaffleCharacterPayload,
    buildPartyRaffleSelectPayload,
    showPartyCharacterSearchModal,
    showKnownCharacterCreateSearchModal,
    buildArcPayload,
    buildArcOptimizerWarningPayload,
    parseTodayCompleted,
    getTodayIsoDate,
    buildArcSettingsPayload,
    showAllRaffleDateModal,
    queryPartyRaffleSummary,
    queryAllRaffleSummary,
    buildRaffleResultPayload,
    buildSettingsPayload,
    syncWalletCharacters,
    bindSelfWallet,
    buildCharacterSettingsPayload,
    buildPartyCharacterSearchResultsPayload,
    buildKnownCreateSearchResultsPayload,
    queryRaffleHistory,
    normalizeDate,
    partyErrorMessage,
    ptLabel,
    buildBackHomeButton,
    searchPartyCharacters,
    buildRaffleCenterPayload,
    buildArcButtons,
    formatArcOptimizerText,
    buildExpPayload,
    buildEnhancementCategoryPayload,
    buildEnhancementLevelPayload,
    buildEnhancementSummaryPayload,
    buildStarforcePricePayload,
    buildPotentialPricePayload,
    enhancementPriceErrorPayload,
    handleSettlementInteraction
  } = runtime;
  const parts = interaction.customId.split('|');
  const action = parts[0];
  const ownerId = parts[1];

  if (action.startsWith('msume_settle_')) {
    return handleSettlementInteraction(interaction);
  }

  if (!verifyOwner(interaction, ownerId)) return;

  try {
    if (interaction.isButton()) {
      if (action === 'msume_bind_wallet') {
        const modal = new ModalBuilder().setCustomId(`msume_bind_wallet_modal|${ownerId}`).setTitle('綁定我的 MSU 錢包');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('wallet').setLabel('MSU 錢包地址').setPlaceholder('0x...').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(42).setMaxLength(42)
        ));
        return interaction.showModal(modal);
      }

      if (action === 'msume_home') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildHomePayload(ownerId));
      }

      if (action === 'msume_pt_home') { await interaction.deferUpdate(); return interaction.editReply(buildPartyHomePayload(ownerId)); }

      if (action === 'msume_pt_create') { return interaction.update(buildPartyBossPayload(ownerId)); }
      if (action === 'msume_pt_create_layer_page') return interaction.update(buildPartyCreateLayerPayload(ownerId, parts[2], Number(parts[3]) || 0));
      if (action === 'msume_pt_layers') return interaction.update(buildPartyLayerPayload(ownerId, parts[2], 'add', 0));
      if (action === 'msume_pt_layer_page') return interaction.update(buildPartyLayerPayload(ownerId, parts[2], parts[3], Number(parts[4]) || 0));
      if (action === 'msume_pt_layer_mode') return interaction.update(buildPartyLayerPayload(ownerId, parts[2], parts[3], Number(parts[4]) || 0));
      if (action === 'msume_pt_raffle') return showPartyRaffleDateModal(interaction, ownerId, parts[2]);
      if (action === 'msume_raffle_personal') { const bind = getBinding(ownerId); return interaction.update(buildRaffleCharacterPayload(ownerId, bind)); }
      if (action === 'msume_raffle_party') return interaction.update(buildPartyRaffleSelectPayload(ownerId));

      if (action === 'msume_pt_search') {
        const partyId=parts[2], party=getPartyById(partyId);
        if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 只有隊長或 OWNER 可以新增角色。',ephemeral:true});
        return showPartyCharacterSearchModal(interaction, ownerId, partyId);
      }
      if (action === 'msume_pt_create_mine') return interaction.update(buildPartyCharacterPayload(ownerId, parts[2], parts[3]));
      if (action === 'msume_pt_create_known') {
        if(ownerId!==process.env.OWNER_ID) return interaction.reply({content:'❌ knownchar 建隊僅限 OWNER。',ephemeral:true});
        return showKnownCharacterCreateSearchModal(interaction, ownerId, parts[2], parts[3]);
      }

      if (action === 'msume_pt_leader_menu') {
        const partyId=parts[2],party=getPartyById(partyId);
        if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        const targets=party.members.filter(m=>m.discordId && m.assetKey!==party.leaderAssetKey);
        if(!targets.length) return interaction.reply({content:'❌ 沒有可接任隊長的 Discord 成員。',ephemeral:true});
        return interaction.update({content:`## 👑 轉讓隊長\n只能轉讓給有 Discord 身分的隊伍成員。`,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_leader_select|${ownerId}|${partyId}`).setPlaceholder('選擇新隊長').addOptions(targets.map(m=>({label:`${m.alias||m.characterName}｜${m.characterName}`.slice(0,100),description:`Discord: ${m.discordId}`.slice(0,100),value:m.assetKey})))),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('取消').setStyle(ButtonStyle.Secondary))]});
      }

      if (action === 'msume_pt_edit') {
        const partyId=parts[2],party=getPartyById(partyId);
        if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        return interaction.update({content:`## ✏️ 編輯 ${party.name}
Boss 由建立時選擇；Layer 請透過「管理 Layer」調整。`,components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`msume_pt_edit_name|${ownerId}|${partyId}`).setLabel('修改名稱').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`msume_pt_layers|${ownerId}|${partyId}`).setLabel('管理 Layer').setStyle(ButtonStyle.Primary)
        ),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('返回').setStyle(ButtonStyle.Secondary))]});
      }
      if (action === 'msume_pt_edit_name') {
        const party=getPartyById(parts[2]); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        const modal=new ModalBuilder().setCustomId(`msume_pt_edit_name_modal|${ownerId}|${parts[2]}`).setTitle('修改隊伍名稱');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partyName').setLabel('新隊伍名稱').setValue(party.name).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)));
        return interaction.showModal(modal);
      }
      if (action === 'msume_pt_edit_boss') {
        const party=getPartyById(parts[2]); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        return interaction.update({content:'## ✏️ 修改 Boss',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_edit_boss_select|${ownerId}|${parts[2]}`).setPlaceholder('選擇新 Boss').addOptions(PT_BOSSES.map(([value,label])=>({label,value,default:value===party.bossId})))),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${parts[2]}`).setLabel('取消').setStyle(ButtonStyle.Secondary))]});
      }
      if (action === 'msume_pt_edit_diff') {
        const party=getPartyById(parts[2]); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        return interaction.update({content:'## ✏️ 修改難度',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_edit_diff_select|${ownerId}|${parts[2]}`).setPlaceholder('選擇新難度').addOptions(PT_DIFFICULTIES.map(([value,label])=>({label,value,default:value===party.difficulty})))),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${parts[2]}`).setLabel('取消').setStyle(ButtonStyle.Secondary))]});
      }

      if (action === 'msume_pt_remove_menu') {
        const partyId=parts[2],party=getPartyById(partyId); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        const removable=party.members.filter(m=>m.assetKey!==party.leaderAssetKey);
        return interaction.update({content:`## ➖ 移除隊員\n請選擇要移除的角色。`,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`msume_pt_remove|${ownerId}|${partyId}`).setPlaceholder('選擇角色').addOptions(removable.slice(0,25).map(m=>({label:`${m.alias || m.characterName}｜${m.characterName}`.slice(0,100),description:`Discord: ${m.discordId}`.slice(0,100),value:m.assetKey})))),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('取消').setStyle(ButtonStyle.Secondary))]});
      }

      if (action === 'msume_pt_delete_confirm') {
        const partyId=parts[2],party=getPartyById(partyId); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
        return interaction.update({content:`⚠️ 確定解散 **${party.name}**？`,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`msume_pt_delete|${ownerId}|${partyId}`).setLabel('確定解散').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`msume_pt_view_button|${ownerId}|${partyId}`).setLabel('取消').setStyle(ButtonStyle.Secondary))]});
      }

      if (action === 'msume_pt_delete') { const partyId=parts[2],party=getPartyById(partyId); if(!canManageParty(party,ownerId,process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true}); archivePartyV2(partyId); return interaction.update(buildPartyHomePayload(ownerId)); }
      if (action === 'msume_pt_view_button') return interaction.update(buildPartyViewPayload(ownerId,parts[2]));

      if (action === 'msume_home_arc') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildArcPayload(ownerId));
      }

      if (action === 'msume_home_raffle') {
        const bind = getBinding(ownerId);
        if (!bind) {
          return interaction.update({ content: '❌ 你還沒有綁定角色。', components: [] });
        }
        return interaction.update(buildRaffleCenterPayload(ownerId));
      }

      if (action === 'msume_enhancement_categories') {
        return interaction.update(buildEnhancementCategoryPayload(ownerId));
      }

      if (action === 'msume_enhancement_levels') {
        return interaction.update(buildEnhancementLevelPayload(ownerId, parts[2]));
      }

      if (action === 'msume_enhancement_starforce') {
        await interaction.deferUpdate();
        try {
          return interaction.editReply(await buildStarforcePricePayload(ownerId, parts[2], Number(parts[3])));
        } catch (error) {
          console.error('[MSUME][Enhancement][Starforce]', error.response?.data || error.stack || error);
          return interaction.editReply(enhancementPriceErrorPayload(ownerId, error));
        }
      }

      if (action === 'msume_enhancement_potential') {
        await interaction.deferUpdate();
        try {
          return interaction.editReply(await buildPotentialPricePayload(ownerId, parts[2], Number(parts[3])));
        } catch (error) {
          console.error('[MSUME][Enhancement][Potential]', error.response?.data || error.stack || error);
          return interaction.editReply(enhancementPriceErrorPayload(ownerId, error));
        }
      }

      if (action === 'msume_enhancement_refresh') {
        await interaction.deferUpdate();
        try {
          return interaction.editReply(await buildEnhancementSummaryPayload(ownerId, parts[2], Number(parts[3]), { force: true }));
        } catch (error) {
          console.error('[MSUME][Enhancement][Refresh]', error.response?.data || error.stack || error);
          return interaction.editReply(enhancementPriceErrorPayload(ownerId, error));
        }
      }

      if (action === 'msume_arc_optimizer') {
        const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
        return interaction.update(
          buildArcOptimizerWarningPayload(
            ownerId,
            alias,
            targetDate,
            lacheleinDaily,
            parseTodayCompleted(completedFlag)
          )
        );
      }

      if (action === 'msume_arc_optimizer_daily') {
        const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
        const modal = new ModalBuilder()
          .setCustomId(`msume_arc_optimizer_modal|${ownerId}|${alias}|${lacheleinDaily || ''}|${completedFlag || '1'}`)
          .setTitle('ARC 最佳化規劃');

        const amountInput = new TextInputBuilder()
          .setCustomId('selectableAmount')
          .setLabel('目前擁有幾顆自選 ARC？')
          .setPlaceholder('例如：150')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7);

        const dateInput = new TextInputBuilder()
          .setCustomId('targetDate')
          .setLabel('預估日期 YYYY-MM-DD')
          .setPlaceholder('例如：2026-07-25')
          .setValue(targetDate || getTodayIsoDate())
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(dateInput)
        );
        return interaction.showModal(modal);
      }

      if (action === 'msume_arc_date') {
        const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
        const modal = new ModalBuilder()
          .setCustomId(`msume_arc_date_modal|${ownerId}|${alias}|${lacheleinDaily || ''}|${completedFlag || '1'}`)
          .setTitle('ARC 預估日期');

        const input = new TextInputBuilder()
          .setCustomId('targetDate')
          .setLabel('請輸入日期 YYYY-MM-DD')
          .setPlaceholder('例如：2026-07-24')
          .setValue(targetDate || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (action === 'msume_arc_settings') {
        const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
        return interaction.update(
          buildArcSettingsPayload(
            ownerId,
            alias,
            targetDate,
            lacheleinDaily,
            parseTodayCompleted(completedFlag)
          )
        );
      }

      if (action === 'msume_arc_back') {
        const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
        await interaction.deferUpdate();
        return interaction.editReply(
          await buildArcPayload(
            ownerId,
            alias,
            targetDate,
            lacheleinDaily,
            parseTodayCompleted(completedFlag)
          )
        );
      }

      if (action === 'msume_raffle_all_date') {
        return showAllRaffleDateModal(interaction, ownerId);
      }

      if (action === 'msume_raffle_party_page') {
        await interaction.deferUpdate();
        return interaction.editReply(await queryPartyRaffleSummary(ownerId, parts[2], parts[3], Number(parts[4]) || 0));
      }

      if (action === 'msume_raffle_all_page') {
        const [, , raffledAt, page] = parts;
        await interaction.deferUpdate();
        return interaction.editReply(
          await queryAllRaffleSummary(ownerId, raffledAt, Number(page))
        );
      }

      if (action === 'msume_raffle_page') {
        const [, , assetKey, raffledAt, page] = parts;
        await interaction.deferUpdate();
        const bind = getBinding(ownerId);
        const character = findCharacterByAssetKey(bind, assetKey);
        const cached = await getArchivedRaffleHistory({
          assetKey: character.assetKey,
          wallet: character.wallet,
          discordId: ownerId,
          alias: character.alias,
          characterName: character.characterName,
          raffledAt
        });
        return interaction.editReply(buildRaffleResultPayload(
          { ...character, __ownerId: ownerId },
          raffledAt,
          cached.result,
          cached.source,
          cached.syncedAt,
          Number(page)
        ));
      }

      if (action === 'msume_settings') {
        await interaction.deferUpdate();
        return interaction.editReply(buildSettingsPayload(ownerId, Number(parts[2]) || 0));
      }

      if (action === 'msume_settings_page') {
        const page = Number(parts[2]) || 0;
        await interaction.deferUpdate();
        return interaction.editReply(buildSettingsPayload(ownerId, page));
      }

      if (action === 'msume_settings_sync') {
        const page = Number(parts[2]) || 0;
        await interaction.deferUpdate();
        const result = await syncWalletCharacters(ownerId);
        if (result.cooldownMs > 0) {
          return interaction.followUp({
            content: `⏳ 錢包角色剛同步過，請在 ${Math.ceil(result.cooldownMs / 60000)} 分鐘後再試。`,
            ephemeral: true
          });
        }
        await interaction.editReply(buildSettingsPayload(ownerId, page));
        return interaction.followUp({
          content: `✅ 錢包角色同步完成：新增 ${result.added} 位、更新 ${result.updated} 位；等級成功 ${result.levelSuccess} 位、失敗 ${result.levelFailed} 位。新角色預設為未啟用。`,
          ephemeral: true
        });
      }

      if (action === 'msume_settings_toggle') {
        const assetKey = parts[2];
        const page = Number(parts[3]) || 0;
        const bind = getBinding(ownerId);
        const character = getAllCharacters(bind).find(c => c.assetKey === assetKey);
        if (!character) return interaction.reply({ content: '❌ 找不到角色。', ephemeral: true });
        setCharacterEnabled(ownerId, assetKey, character.isEnabled === false);
        await interaction.deferUpdate();
        return interaction.editReply(buildCharacterSettingsPayload(ownerId, assetKey, page));
      }

      if (action === 'msume_settings_default') {
        const assetKey = parts[2];
        const page = Number(parts[3]) || 0;
        setDefaultCharacter(ownerId, assetKey);
        await interaction.deferUpdate();
        return interaction.editReply(buildCharacterSettingsPayload(ownerId, assetKey, page));
      }

      if (action === 'msume_settings_rename') {
        const assetKey = parts[2];
        const page = Number(parts[3]) || 0;
        const bind = getBinding(ownerId);
        const character = getAllCharacters(bind).find(c => c.assetKey === assetKey);
        if (!character) return interaction.reply({ content: '❌ 找不到角色。', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`msume_settings_rename_modal|${ownerId}|${assetKey}|${page}`)
          .setTitle('修改角色別名');
        const input = new TextInputBuilder()
          .setCustomId('alias')
          .setLabel('新的角色別名')
          .setValue(String(character.alias || character.characterName || '').slice(0, 100))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(30);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (action === 'msume_raffle_sync') {
        const [, , assetKey, raffledAt] = parts;
        const remain = getManualSyncCooldown(ownerId, assetKey);

        if (remain > 0) {
          return interaction.reply({
            content: `⏳ 請在 ${Math.ceil(remain / 1000)} 秒後再重新同步。`,
            ephemeral: true
          });
        }

        await interaction.deferUpdate();
        const payload = await queryRaffleHistory(ownerId, assetKey, raffledAt, true);
        markManualSync(ownerId, assetKey);
        return interaction.editReply(payload);
      }
    }

    if (interaction.isStringSelectMenu() && action === 'msume_feature') {
      const feature = interaction.values[0];

      if (feature === 'arc') {
        await interaction.deferUpdate();
        return interaction.editReply(await buildArcPayload(ownerId));
      }

      if (feature === 'raffle') {
        const bind = getBinding(ownerId);
        if (!bind) {
          return interaction.update({ content: '❌ 你還沒有綁定角色。', components: [] });
        }
        return interaction.update(buildRaffleCenterPayload(ownerId));
      }

      if (feature === 'party') { return interaction.update(buildPartyHomePayload(ownerId)); }

      if (feature === 'exp') {
        return interaction.update(buildExpPayload(ownerId));
      }

      if (feature === 'enhancement') {
        return interaction.update(buildEnhancementCategoryPayload(ownerId));
      }

      if (feature === 'settings') {
        return interaction.update(buildSettingsPayload(ownerId));
      }
    }




    if (interaction.isStringSelectMenu() && action === 'msume_enhancement_category') {
      return interaction.update(buildEnhancementLevelPayload(ownerId, interaction.values[0]));
    }

    if (interaction.isStringSelectMenu() && action === 'msume_enhancement_level') {
      const categoryKey = parts[2];
      const level = Number(interaction.values[0]);
      await interaction.deferUpdate();
      try {
        return interaction.editReply(await buildEnhancementSummaryPayload(ownerId, categoryKey, level));
      } catch (error) {
        console.error('[MSUME][Enhancement][Summary]', error.response?.data || error.stack || error);
        return interaction.editReply(enhancementPriceErrorPayload(ownerId, error));
      }
    }

    if (interaction.isStringSelectMenu() && action === 'msume_exp_char') {
      return interaction.update(buildExpPayload(ownerId, interaction.values[0]));
    }

    if (interaction.isStringSelectMenu() && action === 'msume_pt_view') return interaction.update(buildPartyViewPayload(ownerId,interaction.values[0]));
    if (interaction.isStringSelectMenu() && action === 'msume_pt_create_boss') return interaction.update(buildPartyCreateLayerPayload(ownerId,interaction.values[0],0));
    if (interaction.isStringSelectMenu() && action === 'msume_pt_create_layer') return interaction.update(buildPartyCreateSourcePayload(ownerId, parts[2], interaction.values.join(',')));
    if (interaction.isStringSelectMenu() && action === 'msume_pt_create_char') {
      const modal=new ModalBuilder().setCustomId(`msume_pt_create_modal|${ownerId}|${parts[2]}|${parts[3]}|${interaction.values[0]}`).setTitle('建立 PT');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partyName').setLabel('隊伍名稱').setPlaceholder('例如：星期六困露團').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)));
      return interaction.showModal(modal);
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_search_select') {
      const partyId=parts[2];
      const [source, first, second] = String(interaction.values[0] || '').split('::');
      try {
        if (source === 'k') {
          if(ownerId!==process.env.OWNER_ID) return interaction.reply({content:'❌ knownchar 加入 PT 僅限 OWNER。',ephemeral:true});
          addKnownCharacterToParty(partyId, getKnownCharacter(first));
        } else if (source === 'b') {
          const character=getCharacters(getBinding(first)).find(c=>c.assetKey===second);
          if(!character) return interaction.reply({content:'❌ 找不到該玩家的已啟用角色。',ephemeral:true});
          addPartyMemberV2(partyId, first, character);
        } else throw new Error('MEMBER_NOT_FOUND');
        return interaction.update(buildPartyViewPayload(ownerId,partyId));
      } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_create_known_select') {
      if(ownerId!==process.env.OWNER_ID) return interaction.reply({content:'❌ knownchar 建隊僅限 OWNER。',ephemeral:true});
      const known=getKnownCharacter(interaction.values[0]);
      if(!known) return interaction.reply({content:'❌ 找不到 knownchar。',ephemeral:true});
      const modal=new ModalBuilder().setCustomId(`msume_pt_create_known_name_modal|${ownerId}|${parts[2]}|${parts[3]}|${known.key}`).setTitle('建立外部角色 PT');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partyName').setLabel('隊伍名稱').setPlaceholder('例如：星期六困露團').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)));
      return interaction.showModal(modal);
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_leader_select') {
      try { transferPartyLeader(parts[2],interaction.values[0]); return interaction.update(buildPartyViewPayload(ownerId,parts[2])); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_edit_boss_select') {
      try { updatePartyV2(parts[2],{bossId:interaction.values[0]}); return interaction.update(buildPartyLayerPayload(ownerId,parts[2],'add',0)); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_edit_diff_select') {
      try { updatePartyV2(parts[2],{difficulty:interaction.values[0]}); return interaction.update(buildPartyLayerPayload(ownerId,parts[2],'add',0)); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_remove') { try { removePartyMemberV2(parts[2],interaction.values[0]); return interaction.update(buildPartyViewPayload(ownerId,parts[2])); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); } }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_leave') { try { leavePartyV2(parts[2],ownerId,interaction.values[0]); return interaction.update(buildPartyHomePayload(ownerId)); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); } }

    if (interaction.isStringSelectMenu() && action === 'msume_pt_layer_add') {
      const party = getPartyById(parts[2]);
      if (!canManageParty(party, ownerId, process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
      interaction.values.forEach(layerId => addPartyLayer(party.name, layerId));
      return interaction.update(buildPartyLayerPayload(ownerId, parts[2], 'add', Number(parts[3]) || 0));
    }
    if (interaction.isStringSelectMenu() && action === 'msume_pt_layer_remove') {
      const party = getPartyById(parts[2]);
      if (!canManageParty(party, ownerId, process.env.OWNER_ID)) return interaction.reply({content:'❌ 權限不足。',ephemeral:true});
      interaction.values.forEach(layerId => removePartyLayer(party.name, layerId));
      return interaction.update(buildPartyLayerPayload(ownerId, parts[2], 'remove', Number(parts[3]) || 0));
    }
    if (interaction.isStringSelectMenu() && action === 'msume_raffle_party_select') return showPartyRaffleDateModal(interaction, ownerId, interaction.values[0]);

    if (interaction.isStringSelectMenu() && action === 'msume_arc_settings_menu') {
      const [, , alias, targetDate, lacheleinDaily, completedFlag] = parts;
      const selected = interaction.values[0];
      const todayCompleted = parseTodayCompleted(completedFlag);

      if (selected === 'toggle_today') {
        await interaction.deferUpdate();
        return interaction.editReply(
          await buildArcPayload(ownerId, alias, targetDate, lacheleinDaily, !todayCompleted)
        );
      }

      if (selected === 'reset') {
        await interaction.deferUpdate();
        return interaction.editReply(
          await buildArcPayload(ownerId, alias, targetDate, '10', true)
        );
      }

      if (selected === 'lachelein') {
        const modal = new ModalBuilder()
          .setCustomId(`msume_arc_lachelein_modal|${ownerId}|${alias}|${targetDate || ''}|${completedFlag || '1'}`)
          .setTitle('拉契爾恩每日 ARC');

        const input = new TextInputBuilder()
          .setCustomId('lacheleinDaily')
          .setLabel('請輸入 1～25')
          .setPlaceholder('例如：10')
          .setValue(String(lacheleinDaily || 10))
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      action === 'msume_settings_character'
    ) {
      const assetKey = interaction.values[0];
      const page = Number(parts[2]) || 0;
    
      return interaction.update(
        buildCharacterSettingsPayload(ownerId, assetKey, page)
      );
    }

    if (interaction.isStringSelectMenu() && action === 'msume_raffle_character') {
      const assetKey = interaction.values[0];

      if (assetKey === '__all_summary__') {
        return showAllRaffleDateModal(interaction, ownerId);
      }

      const bind = getBinding(ownerId);
      const character = findCharacterByAssetKey(bind, assetKey);

      if (!character) {
        return interaction.reply({ content: '❌ 找不到這個綁定角色。', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`msume_raffle_date_modal|${ownerId}|${assetKey}`)
        .setTitle(`${character.characterName || character.alias} 抽獎紀錄`);

      const input = new TextInputBuilder()
        .setCustomId('raffledAt')
        .setLabel('請輸入開獎日期 YYYY-MM-DD')
        .setPlaceholder('例如：2026-07-10')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
      if (action === 'msume_bind_wallet_modal') {
        const wallet = interaction.fields.getTextInputValue('wallet').trim();
        await interaction.deferUpdate();
        try {
          const result = await bindSelfWallet(ownerId, wallet);
          return interaction.editReply({
            content: `✅ 錢包綁定完成，共找到 ${result.total} 隻角色。
等級同步成功 ${result.levelSuccess} 隻、失敗 ${result.levelFailed} 隻。
你可以到玩家設置啟用角色及選擇本尊。`,
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`msume_settings|${ownerId}`).setLabel('前往玩家設置').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`msume_home|${ownerId}`).setLabel('玩家中心').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
            )]
          });
        } catch (error) {
          console.error('[MSUME][SelfBind]', error.response?.data || error.message);
          const content = error.message === 'WALLET_FORMAT' ? '❌ 錢包格式錯誤，請輸入 0x 開頭的 42 碼地址。' : error.message === 'WALLET_NO_CHARACTERS' ? '❌ 此錢包查不到角色，請確認錢包地址。' : '❌ 綁定或同步失敗，請稍後再試。';
          return interaction.editReply({ content, components: [] });
        }
      }

      if (action === 'msume_pt_search_modal') {
        const query=interaction.fields.getTextInputValue('query').trim();
        return interaction.update(buildPartyCharacterSearchResultsPayload(ownerId, parts[2], query));
      }
      if (action === 'msume_pt_create_known_search_modal') {
        if(ownerId!==process.env.OWNER_ID) return interaction.reply({content:'❌ knownchar 建隊僅限 OWNER。',ephemeral:true});
        const query=interaction.fields.getTextInputValue('query').trim();
        return interaction.update(buildKnownCreateSearchResultsPayload(ownerId, parts[2], parts[3], query));
      }
      if (action === 'msume_pt_create_known_name_modal') {
        if(ownerId!==process.env.OWNER_ID) return interaction.reply({content:'❌ knownchar 建隊僅限 OWNER。',ephemeral:true});
        const bossId=parts[2],layerIds=String(parts[3]||'').split(',').filter(Boolean),known=getKnownCharacter(parts[4]),name=interaction.fields.getTextInputValue('partyName').trim();
        if(!known) return interaction.reply({content:'❌ 找不到 knownchar。',ephemeral:true});
        if(!layerIds.length) return interaction.reply({content:'❌ 請至少選擇一個 Layer。',ephemeral:true});
        try { const party=createPartyV2({name,bossId,initialLayerId:layerIds[0],leaderDiscordId:ownerId,memberDiscordId:null,character:known,sourceType:'known',sourceKey:known.key}); layerIds.slice(1).forEach(id=>addPartyLayer(party.name,id)); return interaction.update(buildPartyLayerPayload(ownerId, party.partyId, 'add', 0)); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
      }

      if (action === 'msume_pt_create_modal') {
        const bossId=parts[2],layerIds=String(parts[3]||'').split(',').filter(Boolean),assetKey=parts[4],name=interaction.fields.getTextInputValue('partyName').trim();
        const character=getCharacters(getBinding(ownerId)).find(c=>c.assetKey===assetKey);
        if(!character) return interaction.reply({content:'❌ 找不到已啟用角色。',ephemeral:true});
        if(!layerIds.length) return interaction.reply({content:'❌ 請至少選擇一個 Layer。',ephemeral:true});
        try { const party=createPartyV2({name,bossId,initialLayerId:layerIds[0],leaderDiscordId:ownerId,character}); layerIds.slice(1).forEach(id=>addPartyLayer(party.name,id)); return interaction.update(buildPartyLayerPayload(ownerId, party.partyId, 'add', 0)); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
      }


      if (action === 'msume_pt_edit_name_modal') {
        const name=interaction.fields.getTextInputValue('partyName').trim();
        try { updatePartyV2(parts[2],{name}); return interaction.update(buildPartyViewPayload(ownerId,parts[2])); } catch(e){ return interaction.reply({content:partyErrorMessage(e),ephemeral:true}); }
      }

      if (action === 'msume_settings_rename_modal') {
        const assetKey = parts[2];
        const page = Number(parts[3]) || 0;
        const alias = interaction.fields.getTextInputValue('alias').trim();
        if (!alias) return interaction.reply({ content: '❌ 別名不能為空。', ephemeral: true });
        renameCharacterAlias(ownerId, assetKey, alias);
        return interaction.update(buildCharacterSettingsPayload(ownerId, assetKey, page));
      }

      if (action === 'msume_arc_optimizer_modal') {
        const [, , alias, lacheleinDaily, completedFlag] = parts;
        const amountText = interaction.fields.getTextInputValue('selectableAmount').trim();
        const amount = Number(amountText);
        const targetDate = normalizeDate(interaction.fields.getTextInputValue('targetDate'));

        if (!Number.isInteger(amount) || amount < 0) {
          return interaction.reply({
            content: '❌ 自選 ARC 請輸入 0 以上的整數。',
            ephemeral: true
          });
        }

        if (!targetDate) {
          return interaction.reply({
            content: '❌ 日期格式錯誤，請使用 `YYYY-MM-DD`。',
            ephemeral: true
          });
        }

        const bind = getBinding(ownerId);
        if (!bind) return interaction.reply({ content: '❌ 你還沒有綁定角色。', ephemeral: true });
        const selectedCharacter = findCharacterByAlias(bind, alias) || getDefaultCharacter(bind);
        if (!selectedCharacter) return interaction.reply({ content: '❌ 找不到已啟用角色。', ephemeral: true });

        const options = { todayCompleted: parseTodayCompleted(completedFlag) };
        if (lacheleinDaily) options.lacheleinDaily = Number(lacheleinDaily);

        await interaction.deferUpdate();
        const character = await getCharacterDetail(selectedCharacter.assetKey);
        const content = formatArcOptimizerText(character, targetDate, amount, options);

        return interaction.editReply({
          content,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`msume_arc_optimizer|${ownerId}|${selectedCharacter.alias || '本尊'}|${targetDate}|${lacheleinDaily || ''}|${completedFlag || '1'}`)
                .setLabel('重新規劃')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`msume_arc_back|${ownerId}|${selectedCharacter.alias || '本尊'}|${targetDate}|${lacheleinDaily || ''}|${completedFlag || '1'}`)
                .setLabel('返回 ARC')
                .setEmoji('🌀')
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }

      if (action === 'msume_arc_date_modal' || action === 'msume_arc_lachelein_modal') {
        const [, , alias, oldValue, completedFlag] = parts;
        let targetDate = '';
        let lacheleinDaily = '';

        if (action === 'msume_arc_date_modal') {
          targetDate = interaction.fields.getTextInputValue('targetDate');
          lacheleinDaily = oldValue || '';
        } else {
          targetDate = oldValue || '';
          lacheleinDaily = interaction.fields.getTextInputValue('lacheleinDaily');
        }

        if (lacheleinDaily) {
          const daily = Number(lacheleinDaily);
          if (!Number.isInteger(daily) || daily < 1 || daily > 25) {
            return interaction.reply({
              content: '❌ 拉契爾恩每日請輸入 1～25。',
              ephemeral: true
            });
          }
        }

        return interaction.update(
          await buildArcPayload(
            ownerId,
            alias,
            targetDate,
            lacheleinDaily,
            parseTodayCompleted(completedFlag)
          )
        );
      }

      if (action === 'msume_raffle_party_date_modal') {
        const raffledAt = normalizeDate(interaction.fields.getTextInputValue('raffledAt'));
        if (!raffledAt) return interaction.reply({content:'❌ 日期格式錯誤，請使用 YYYY-MM-DD。',ephemeral:true});
        await interaction.deferUpdate();
        return interaction.editReply(await queryPartyRaffleSummary(ownerId, parts[2], raffledAt, 0));
      }

      if (action === 'msume_raffle_all_date_modal') {
        const inputDate = interaction.fields.getTextInputValue('raffledAt');
        const raffledAt = normalizeDate(inputDate);

        if (!raffledAt) {
          return interaction.reply({
            content: '❌ 日期格式錯誤，請輸入 `YYYY-MM-DD`。',
            ephemeral: true
          });
        }

        await interaction.deferUpdate();
        return interaction.editReply(
          await queryAllRaffleSummary(ownerId, raffledAt, 0)
        );
      }

      if (action === 'msume_raffle_date_modal') {
        const assetKey = parts[2];
        const inputDate = interaction.fields.getTextInputValue('raffledAt');
        const raffledAt = normalizeDate(inputDate);

        if (!raffledAt) {
          return interaction.reply({
            content: '❌ 日期格式錯誤，請輸入 `YYYY-MM-DD`。',
            ephemeral: true
          });
        }

        await interaction.deferUpdate();
        return interaction.editReply(
          await queryRaffleHistory(ownerId, assetKey, raffledAt, false)
        );
      }
    }
  } catch (error) {
    console.error('===== MSUME INTERACTION ERROR =====');
    console.error(error.response?.data || error.stack || error.message);

    const apiMessage = error.response?.data?.error?.message || '';
    const content = apiMessage.includes('failed to get character raffle history')
      ? '🎟️ 查無指定日期的抽獎歷史。可能是這天不是開獎日、超過可查範圍，或角色沒有參與。'
      : '❌ 玩家中心操作失敗，請稍後再試。';

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content, components: [] }).catch(() => {});
    }

    return interaction.reply({ content, ephemeral: true }).catch(() => {});
  }
}


module.exports = { handleInteraction };
