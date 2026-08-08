function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createRating(label, value) {
  const safeValue = Number.isInteger(value) && value >= 1 && value <= 5
    ? value
    : 0;

  return createTextElement(
    'div',
    '',
    `${label}: ${'★'.repeat(safeValue)}${'☆'.repeat(5 - safeValue)}`
  );
}

function createUserBadge(badge, approvedReviewCount) {
  if (!badge?.key || !badge?.label) {
    return null;
  }

  const element = createTextElement(
    'span',
    `user-badge user-badge-${badge.key}`,
    badge.label
  );
  const count = Number(approvedReviewCount) || 0;
  element.title = `已通過 ${count} 則評價`;
  element.setAttribute('aria-label', `${badge.label}，已通過 ${count} 則評價`);
  return element;
}

let viewerSessionPromise;

function getViewerSession() {
  if (!window.CruiseAuth) {
    return Promise.resolve(null);
  }

  if (!viewerSessionPromise) {
    viewerSessionPromise = window.CruiseAuth.getSession().catch(() => null);
  }

  return viewerSessionPromise;
}

async function commentApiRequest(url, options = {}) {
  const session = await getViewerSession();
  const response = session?.user
    ? await window.CruiseAuth.authFetch(url, options)
    : await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || '發生錯誤，請稍後再試。');
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatCommentDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function createCommentsSection(opinion) {
  const opinionId = Number(opinion.id);
  const section = document.createElement('section');
  const panelId = `review-${opinionId}-comments-panel`;
  const anchorId = `review-${opinionId}-comments`;
  const targetMatch = window.location.hash.match(/^#review-(\d+)-comment-(\d+)$/);
  const targetCommentId = targetMatch && Number(targetMatch[1]) === opinionId
    ? targetMatch[2]
    : '';
  let commentCount = Number(opinion.commentCount) || 0;
  let commentsLoaded = false;
  let composerLoaded = false;

  section.className = 'review-comments';
  section.id = anchorId;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'review-comments-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panelId);

  const updateToggle = () => {
    toggle.textContent = `留言（${commentCount}）`;
  };

  updateToggle();

  const panel = document.createElement('div');
  panel.className = 'review-comments-panel';
  panel.id = panelId;
  panel.hidden = true;

  const list = document.createElement('div');
  list.className = 'review-comments-list';

  const composer = document.createElement('div');
  composer.className = 'review-comment-composer';

  const message = createTextElement('p', 'review-comments-message', '');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');

  const setMessage = (text, tone = '') => {
    message.textContent = text;
    message.classList.toggle('is-error', tone === 'error');
    message.classList.toggle('is-success', tone === 'success');
  };

  async function loadComments(force = false) {
    if (commentsLoaded && !force) {
      return;
    }

    list.replaceChildren(
      createTextElement('p', 'review-comments-loading', '正在載入留言…')
    );

    try {
      const comments = await commentApiRequest(`/api/opinions/${opinionId}/comments`);
      commentCount = comments.length;
      commentsLoaded = true;
      updateToggle();
      list.replaceChildren();

      if (comments.length === 0) {
        list.appendChild(
          createTextElement('p', 'review-comments-empty', '目前還沒有留言。')
        );
        return;
      }

      const repliesByParent = new Map();
      const rootComments = [];

      comments.forEach(comment => {
        if (comment.parentCommentId == null) {
          rootComments.push(comment);
          return;
        }

        const parentKey = String(comment.parentCommentId);
        const replies = repliesByParent.get(parentKey) || [];
        replies.push(comment);
        repliesByParent.set(parentKey, replies);
      });

      const highlightComment = commentId => {
        if (!commentId) {
          return;
        }

        const target = document.getElementById(`comment-${commentId}`);
        if (!target) {
          return;
        }

        target.classList.add('is-highlighted');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target.classList.remove('is-highlighted'), 3200);
      };

      const renderComment = (comment, { isReply = false, replyCount = 0 } = {}) => {
        const item = document.createElement('article');
        item.className = `review-comment${isReply ? ' review-comment-reply' : ''}`;
        item.id = `comment-${comment.id}`;

        const header = document.createElement('div');
        header.className = 'review-comment-header';

        const identity = document.createElement('div');
        identity.className = 'review-comment-identity';
        identity.appendChild(
          createTextElement('strong', 'review-comment-author', comment.author || '郵輪旅人')
        );

        const badge = createUserBadge(comment.badge, comment.approvedReviewCount);
        if (badge) {
          identity.appendChild(badge);
        }

        const meta = document.createElement('div');
        meta.className = 'review-comment-meta';
        meta.appendChild(
          createTextElement('time', 'review-comment-date', formatCommentDate(comment.createdAt))
        );

        if (comment.editedAt) {
          meta.appendChild(createTextElement('span', 'review-comment-edited', '已編輯'));
        }

        const textElement = createTextElement(
          'p',
          'review-comment-text',
          comment.text || ''
        );
        const actions = document.createElement('div');
        actions.className = 'review-comment-actions';

        header.append(identity, meta);
        item.append(header, textElement);

        if (comment.canReply && !isReply) {
          const replyButton = document.createElement('button');
          replyButton.type = 'button';
          replyButton.className = 'review-comment-reply-button';
          replyButton.textContent = '回覆';

          replyButton.addEventListener('click', () => {
            setMessage('');
            actions.hidden = true;

            const replyForm = document.createElement('form');
            replyForm.className = 'review-comment-reply-form';
            replyForm.appendChild(
              createTextElement(
                'label',
                'review-comment-reply-label',
                `回覆 ${comment.author || '郵輪旅人'}`
              )
            );

            const textarea = document.createElement('textarea');
            textarea.maxLength = 1000;
            textarea.required = true;
            textarea.placeholder = '寫下你的回覆…';
            textarea.setAttribute('aria-label', `回覆 ${comment.author || '郵輪旅人'}`);

            const replyActions = document.createElement('div');
            replyActions.className = 'review-comment-edit-actions';

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'review-comment-edit-cancel';
            cancelButton.textContent = '取消';

            const submitButton = document.createElement('button');
            submitButton.type = 'submit';
            submitButton.className = 'review-comment-edit-save';
            submitButton.textContent = '發布回覆';

            const closeReplyForm = () => {
              replyForm.remove();
              actions.hidden = false;
            };

            cancelButton.addEventListener('click', closeReplyForm);

            replyForm.addEventListener('submit', async event => {
              event.preventDefault();
              const text = textarea.value.trim();

              if (!text) {
                setMessage('請輸入回覆內容。', 'error');
                textarea.focus();
                return;
              }

              textarea.disabled = true;
              cancelButton.disabled = true;
              submitButton.disabled = true;
              submitButton.textContent = '發布中…';
              setMessage('發布中…');

              try {
                const savedReply = await commentApiRequest(
                  `/api/comments/${comment.id}/replies`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                  }
                );
                await loadComments(true);
                setMessage('回覆已發布。', 'success');
                highlightComment(savedReply.id);
              } catch (error) {
                textarea.disabled = false;
                cancelButton.disabled = false;
                submitButton.disabled = false;
                submitButton.textContent = '發布回覆';
                setMessage(error.message, 'error');
              }
            });

            replyActions.append(cancelButton, submitButton);
            replyForm.append(textarea, replyActions);
            item.insertBefore(replyForm, actions);
            textarea.focus();
          });

          actions.appendChild(replyButton);
        }

        if (comment.canEdit) {
          const editButton = document.createElement('button');
          editButton.type = 'button';
          editButton.className = 'review-comment-edit';
          editButton.textContent = '編輯';

          editButton.addEventListener('click', () => {
            setMessage('');
            textElement.hidden = true;
            actions.hidden = true;

            const editForm = document.createElement('form');
            editForm.className = 'review-comment-edit-form';

            const textarea = document.createElement('textarea');
            textarea.maxLength = 1000;
            textarea.required = true;
            textarea.value = comment.text || '';
            textarea.setAttribute('aria-label', '編輯留言');

            const editActions = document.createElement('div');
            editActions.className = 'review-comment-edit-actions';

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'review-comment-edit-cancel';
            cancelButton.textContent = '取消';

            const saveButton = document.createElement('button');
            saveButton.type = 'submit';
            saveButton.className = 'review-comment-edit-save';
            saveButton.textContent = '儲存';

            const closeEditor = () => {
              editForm.remove();
              textElement.hidden = false;
              actions.hidden = false;
            };

            cancelButton.addEventListener('click', closeEditor);

            editForm.addEventListener('submit', async event => {
              event.preventDefault();
              const text = textarea.value.trim();

              if (!text) {
                setMessage('請輸入留言內容。', 'error');
                textarea.focus();
                return;
              }

              textarea.disabled = true;
              cancelButton.disabled = true;
              saveButton.disabled = true;
              saveButton.textContent = '儲存中…';
              setMessage('儲存中…');

              try {
                await commentApiRequest(`/api/comments/${comment.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text })
                });
                await loadComments(true);
                setMessage('留言已更新。', 'success');
              } catch (error) {
                textarea.disabled = false;
                cancelButton.disabled = false;
                saveButton.disabled = false;
                saveButton.textContent = '儲存';
                setMessage(error.message, 'error');
              }
            });

            editActions.append(cancelButton, saveButton);
            editForm.append(textarea, editActions);
            item.insertBefore(editForm, actions);
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          });

          actions.appendChild(editButton);
        }

        if (comment.canDelete) {
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.className = 'review-comment-delete';
          deleteButton.textContent = '刪除';

          deleteButton.addEventListener('click', async () => {
            const confirmationText = replyCount > 0
              ? `確定要刪除這則留言及其 ${replyCount} 則回覆嗎？\n刪除後無法復原。`
              : '確定要刪除這則留言嗎？\n刪除後無法復原。';

            if (!window.confirm(confirmationText)) {
              return;
            }

            deleteButton.disabled = true;
            setMessage('刪除中…');

            try {
              await commentApiRequest(`/api/comments/${comment.id}`, { method: 'DELETE' });
              await loadComments(true);
              setMessage('留言已刪除。', 'success');
            } catch (error) {
              deleteButton.disabled = false;
              setMessage(error.message, 'error');
            }
          });

          actions.appendChild(deleteButton);
        }

        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }

        return item;
      };

      rootComments.forEach(comment => {
        const replies = repliesByParent.get(String(comment.id)) || [];
        const thread = document.createElement('div');
        thread.className = 'review-comment-thread';
        thread.appendChild(renderComment(comment, { replyCount: replies.length }));

        if (replies.length > 0) {
          const repliesContainer = document.createElement('div');
          repliesContainer.className = 'review-comment-replies';
          replies.forEach(reply => {
            repliesContainer.appendChild(renderComment(reply, { isReply: true }));
          });
          thread.appendChild(repliesContainer);
        }

        list.appendChild(thread);
      });

      highlightComment(targetCommentId);
    } catch (error) {
      list.replaceChildren(
        createTextElement('p', 'review-comments-error', error.message)
      );
    }
  }

  async function loadComposer() {
    if (composerLoaded) {
      return;
    }

    composerLoaded = true;
    const session = await getViewerSession();

    if (!session?.user) {
      const prompt = document.createElement('div');
      prompt.className = 'review-comment-login';
      prompt.appendChild(createTextElement('span', '', '登入後即可留言'));

      const loginLink = document.createElement('a');
      const returnTo = `${window.location.pathname}${window.location.search}#${anchorId}`;
      loginLink.href = `/account?returnTo=${encodeURIComponent(returnTo)}`;
      loginLink.textContent = '登入／註冊';
      prompt.appendChild(loginLink);
      composer.appendChild(prompt);
      return;
    }

    const form = document.createElement('form');
    form.className = 'review-comment-form';

    const textarea = document.createElement('textarea');
    textarea.maxLength = 1000;
    textarea.placeholder = '寫下你的留言…';
    textarea.setAttribute('aria-label', '留言內容');
    textarea.required = true;

    const footer = document.createElement('div');
    footer.className = 'review-comment-form-footer';
    footer.appendChild(createTextElement('span', '', `將以 ${session.user.name} 的名稱發布`));

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = '發布留言';
    footer.appendChild(submitButton);
    form.append(textarea, footer);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = textarea.value.trim();

      if (!text) {
        setMessage('請輸入留言內容。', 'error');
        textarea.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '發布中…';
      setMessage('');

      try {
        await commentApiRequest(`/api/opinions/${opinionId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        textarea.value = '';
        await loadComments(true);
        setMessage('留言已發布。', 'success');
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = '發布留言';
      }
    });

    composer.appendChild(form);
  }

  toggle.addEventListener('click', async () => {
    const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(willOpen));
    panel.hidden = !willOpen;

    if (willOpen) {
      await Promise.all([loadComments(), loadComposer()]);
    }
  });

  panel.append(list, composer, message);
  section.append(toggle, panel);

  if (window.location.hash === `#${anchorId}` || targetCommentId) {
    window.setTimeout(() => {
      toggle.click();
      if (!targetCommentId) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }

  return section;
}

function createReviewCard(opinion) {
  const review = document.createElement('article');
  review.className = 'review';

  review.appendChild(createTextElement('h3', '', opinion.title || ''));

  const author = document.createElement('div');
  author.className = 'review-author';
  const authorIdentity = document.createElement('span');
  authorIdentity.className = 'review-author-identity';
  authorIdentity.append(
    createTextElement('span', 'review-author-label', '分享者：'),
    createTextElement('span', 'review-author-name', opinion.author || '')
  );
  author.appendChild(authorIdentity);

  const userBadge = createUserBadge(opinion.badge, opinion.approvedReviewCount);
  if (userBadge) {
    author.appendChild(userBadge);
  }

  const approvedReviewCount = Number(opinion.approvedReviewCount) || 0;
  if (approvedReviewCount > 0) {
    author.appendChild(createTextElement('span', 'review-author-separator', '·'));
    author.appendChild(
      createTextElement(
        'span',
        'review-author-count',
        `已分享了${approvedReviewCount}則評價`
      )
    );
  }

  review.appendChild(author);

  const header = document.createElement('div');
  header.className = 'review-header';

  const shipMeta = document.createElement('span');
  shipMeta.className = 'review-meta-item';
  shipMeta.append(
    createTextElement('span', 'review-meta-label', '郵輪：'),
    createTextElement('span', 'review-ship-name', opinion.ship || '')
  );

  const dateMeta = document.createElement('span');
  dateMeta.className = 'review-meta-item';
  dateMeta.append(
    createTextElement('span', 'review-meta-label', '搭船日期：'),
    createTextElement('span', 'review-date-value', opinion.date || '')
  );

  header.append(shipMeta, dateMeta);
  review.appendChild(header);

  const ratings = document.createElement('div');
  ratings.className = 'review-ratings';
  ratings.appendChild(createRating('裝潢', opinion.ratings?.decor));
  ratings.appendChild(createRating('服務', opinion.ratings?.service));
  ratings.appendChild(createRating('房間', opinion.ratings?.room));
  ratings.appendChild(createRating('食物', opinion.ratings?.food));
  review.appendChild(ratings);

  review.appendChild(createTextElement('div', 'review-section-title', '旅客心得'));

  const reviewText = createTextElement('p', 'review-text', opinion.text || '');
  review.appendChild(reviewText);

  if ((opinion.text || '').length > 180) {
    reviewText.classList.add('is-collapsed');

    const toggleTextButton = document.createElement('button');
    toggleTextButton.type = 'button';
    toggleTextButton.className = 'review-text-toggle';
    toggleTextButton.textContent = '顯示更多';
    toggleTextButton.setAttribute('aria-expanded', 'false');

    toggleTextButton.addEventListener('click', () => {
      const isExpanded = toggleTextButton.getAttribute('aria-expanded') === 'true';
      reviewText.classList.toggle('is-collapsed', isExpanded);
      toggleTextButton.setAttribute('aria-expanded', String(!isExpanded));
      toggleTextButton.textContent = isExpanded ? '顯示更多' : '收起';
    });

    review.appendChild(toggleTextButton);
  }

  review.appendChild(createCommentsSection(opinion));

  return review;
}

function updateRatingSummary(opinions) {
  const averageElement = document.querySelector('[data-rating-average]');
  const starsElement = document.querySelector('[data-rating-stars]');
  const countElement = document.querySelector('[data-rating-count]');

  if (!averageElement || !starsElement || !countElement) {
    return;
  }

  const ratings = opinions.flatMap(opinion => [
    opinion.ratings?.decor,
    opinion.ratings?.room,
    opinion.ratings?.service,
    opinion.ratings?.food
  ]).map(Number).filter(value => Number.isFinite(value) && value >= 1 && value <= 5);

  if (opinions.length === 0 || ratings.length === 0) {
    averageElement.textContent = '—';
    starsElement.style.setProperty('--rating-fill', '0%');
    countElement.textContent = '目前還沒有評價';
    return;
  }

  const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  averageElement.textContent = average.toFixed(1);
  starsElement.style.setProperty('--rating-fill', `${(average / 5) * 100}%`);
  countElement.textContent = `${opinions.length} 則評價`;
}

function createEmptyReviews(options = {}) {
  const empty = document.createElement('div');
  empty.className = 'empty-reviews';

  const title = createTextElement(
    'h3',
    'empty-reviews-title',
    options.emptyTitle || '目前還沒有評價'
  );
  const text = createTextElement(
    'p',
    'empty-reviews-text',
    options.emptyText || '還沒有人分享搭乘體驗。'
  );
  empty.append(title, text);

  if (options.ctaHref) {
    const link = document.createElement('a');
    link.className = 'add-button empty-reviews-button';
    link.href = options.ctaHref;
    link.textContent = options.ctaText || '撰寫第一則評價';
    empty.appendChild(link);
  }

  return empty;
}

function renderReviews(opinions, options = {}) {
  const container = document.getElementById('reviews');
  container.replaceChildren();
  updateRatingSummary(opinions);

  if (opinions.length === 0) {
    container.appendChild(createEmptyReviews(options));
    return;
  }

  opinions.forEach(opinion => {
    container.appendChild(createReviewCard(opinion));
  });
}

async function loadReviews(filter, options = {}) {
  const container = document.getElementById('reviews');

  try {
    const response = await fetch('/api/opinions');

    if (!response.ok) {
      throw new Error('無法載入評價');
    }

    const opinions = await response.json();
    const filteredOpinions = opinions.filter(filter);

    renderReviews(filteredOpinions, options);
    return filteredOpinions;
  } catch (error) {
    updateRatingSummary([]);
    container.replaceChildren(
      createTextElement('p', 'reviews-error', '暫時無法載入評價，請稍後再試。')
    );
    return [];
  }
}

window.ReviewsUI = {
  loadReviews,
  renderReviews,
  updateRatingSummary
};
