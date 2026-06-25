utils.jq(() => {
  const els = Array.from(document.getElementsByClassName('ds-memos'));

  els.forEach(el => {
    const api = el.dataset.api;
    if (!api) return;

    const default_avatar = el.getAttribute('avatar') || def.avatar;
    const limit = el.getAttribute('limit');
    const host = api.match(/https:\/\/(.*?)\/(.*)/i)[1];

    utils.request(el, api, async resp => {
      const data = await resp.json();
      let memos = versionHandlers.identify(data);
      if (memos.version === "feature" )return;

      const users = el.getAttribute('user')?.split(",") || [];
      const hide = el.getAttribute('hide')?.split(",") || [];

      await Promise.all(memos.data.slice(0, limit || memos.data.length).map(item =>
          createMemoCell(item, memos, users, hide, default_avatar, host).then(cell => $(el).append(cell))
      ));
    });

    async function createMemoCell(item, memos, users, hide, default_avatar, host) {
      const versionHandler = versionHandlers[memos.version] || versionHandlers["feature"];
      let bodyContent = marked.parse(item.content || '');
      
      // 添加图片
      const images = versionHandler.buildImages(item, host);
      if (images.length > 0) {
        bodyContent += images.join('');
      }
      
      // 添加引用关系
      if (versionHandler.buildRelations) {
        const relations = versionHandler.buildRelations(item, memos);
        if (relations) bodyContent += relations;
      }
      
      // 添加反应
      if (versionHandler.buildReactions) {
        const reactions = versionHandler.buildReactions(item);
        if (reactions) bodyContent += reactions;
      }
      
      // 作者 ID 映射
      const creatorId = item?.creator?.split('/')[1];
      const authorMap = {
        '1': 'alander',
        '4': 'lau'
      };
      const authorName = authorMap[creatorId] || 'memos';
      
      return `<div class="timenode" id="${item.name ? item.name.split('/')[1] : ''}">
                      <div class="header">${!users.length && !hide.includes('user') ? await versionHandler.buildUser(item, memos, default_avatar) : ''}
                      <span>${versionHandler.buildDate(item).toLocaleString()} · ${authorName}</span></div>
                      <div class="body">${bodyContent}
                      </div></div>`;
    }

    // Memos版本管理
    const versionHandlers = {
      "22-": {
        buildUser: async (item, memos, default_avatar) =>
            `<div class="user-info">${default_avatar ? `<img src="${default_avatar}">` : ''}<span>${item.creatorName}</span></div>`,
        buildDate: item => new Date(item.createdTs * 1000),
        buildImages: (item, host) => (item.resourceList || []).filter(res => res.type?.includes('image/')).map(res =>
            `<p><img src="${res.externalLink || `https://${host}/o/r/${res.id}`}"></p>`
        )
      },
      "22+": {
        buildUser: async (item, memos, default_avatar) => {
          const creatorId = item?.creator.split('/')[1];
          let user = memos.users.find(user => user.id === parseInt(creatorId));
          if (!user) {
            if (!memos.requests[creatorId]) {
              memos.requests[creatorId] = fetch(`${memos.site}/api/v1/users/${creatorId}`)
                  .then(response => response.json())
                  .then(data => {
                    if (data.username) {
                      user = data;
                      memos.users.push(data);
                    } else {
                      user = null;
                    }
                  })
                  .finally(() => delete memos.requests[creatorId]);
            }
            await memos.requests[creatorId];
            user = memos.users.find(user => user.id === parseInt(creatorId));
          }
          const name = user ? user.nickname || user.username : 'memos';
          const avatarUrl = user?.avatarUrl ? `${memos.site}${user.avatarUrl}` : default_avatar || '';
          return `<div class="user-info">${avatarUrl ? `<img src="${avatarUrl}">` : ''}<span>${name}</span></div>`;
        },
        buildDate: item => new Date(item.createTime),
        buildImages: (item, host) => {
          // 支持 attachments (v1 API) �?resources (旧版 API)
          const attachments = item.attachments || item.resources || [];
          return attachments
            .filter(res => res.type?.includes('image/') || res.filename?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i))
            .map(res => `<p><img src="${res.externalLink || res.url || `https://${host}/o/r/${res.id}`}" alt="${res.filename || ''}"></p>`);
        },
        buildReactions: (item) => {
          // 处理点赞/表情反应
          if (!item.reactions || item.reactions.length === 0) return '';
          // reactionType ֱ�Ӿ��Ǳ�����ţ�����Ҫӳ��
          const reactionCounts = {};
          item.reactions.forEach(reaction => {
            // reactionType 直接就是表情符号
            const type = reaction.reactionType || '👍';
            reactionCounts[type] = (reactionCounts[type] || 0) + 1;
          });
          let html = '<div class="reactions">';
          Object.entries(reactionCounts).forEach(([emoji, count]) => {
            html += `<span class="reaction">${emoji} ${count}</span>`;
          });
          html += '</div>';
          return html;
        },
        buildRelations: (item, memos) => {
          // 处理引用/回复关系
          if (!item.relations || item.relations.length === 0) return '';
          let html = '<div class="relations">';
          item.relations.forEach(rel => {
            if (rel.relatedMemo && rel.relatedMemo.name) {
              const memoId = rel.relatedMemo.name.split('/')[1];
              html += `<a class="relation" href="#${memoId}">🔗 引用</a>`;
            }
          });
          html += '</div>';
          return html;
        }
      },
      "feature": {
        buildUser: async () => "memos",
        buildDate: () => new Date(),
        buildImages: () => []
      },
      identify: (data) => {
        let memos = { version: "feature", users: [], site: api.split('/api/v1')[0], requests: {}, data: [] }
        if (Array.isArray(data)) {
          memos.version = "22-";
          memos.data = data;
        } else if (data.memos) {
          memos.version = "22+";
          memos.data = data.memos;
        } else {
          memos.version = "feature";
          console.log("当前Memos版本过高，请到Stellar社区反馈");
        }
        return memos
      }
    };
  });
});


