/**
 * 幻星字幕下载 (Version 2) - 侧边栏脚本
 * 专注核心功能：一键获取当前B站视频字幕并直接复制到剪贴板
 */

document.addEventListener('DOMContentLoaded', () => {
  const quickExtractAndCopyBtn = document.getElementById('quickExtractAndCopyBtn');
  const quickExtractResult = document.getElementById('quickExtractResult');
  const quickExtractTitle = document.getElementById('quickExtractTitle');
  const quickExtractLength = document.getElementById('quickExtractLength');
  const quickExtractPreview = document.getElementById('quickExtractPreview');
  const quickExtractCollapseBtn = document.getElementById('quickExtractCollapseBtn');
  const quickExtractCollapseText = document.getElementById('quickExtractCollapseText');
  const quickExtractCloseBtn = document.getElementById('quickExtractCloseBtn');

  const successToast = document.getElementById('successToast');
  const errorToast = document.getElementById('errorToast');

  let toastTimer = null;

  // ================= Toast 提示 =================
  function showToast(element, message, duration = 2500) {
    if (!element) return;
    clearTimeout(toastTimer);

    // 隐藏其他 toast
    if (successToast) successToast.classList.remove('show');
    if (errorToast) errorToast.classList.remove('show');

    const msgEl = element.querySelector('.success-toast-message, .error-toast-message');
    if (msgEl) msgEl.textContent = message;

    element.classList.add('show');
    toastTimer = setTimeout(() => {
      element.classList.remove('show');
    }, duration);
  }

  function showSuccess(msg) {
    showToast(successToast, msg, 2500);
  }

  function showError(msg) {
    showToast(errorToast, msg, 3200);
  }

  // 关闭按钮事件绑定
  document.querySelectorAll('.success-toast-close, .error-toast-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (successToast) successToast.classList.remove('show');
      if (errorToast) errorToast.classList.remove('show');
    });
  });

  // ================= 辅助函数：解析视频地址 =================
  function extractBilibiliVideoId(url) {
    if (!url) return null;
    const bvRegex = /bilibili\.com\/video\/(BV\w+)/i;
    const bvMatch = url.match(bvRegex);
    if (bvMatch) return bvMatch[1];

    const shortRegex = /b23\.tv\/(\w+)/i;
    const shortMatch = url.match(shortRegex);
    if (shortMatch) return shortMatch[1];

    const avRegex = /bilibili\.com\/video\/av(\d+)/i;
    const avMatch = url.match(avRegex);
    if (avMatch) return `av${avMatch[1]}`;

    return null;
  }

  function isBilibiliUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host === 'b23.tv') return true;
      if (host.includes('bilibili.com')) {
        return /\/video\/(BV\w+|av\d+)/i.test(parsed.pathname);
      }
    } catch (e) {}
    return false;
  }

  // ================= 核心操作：一键提取并复制当前字幕 =================
  async function quickExtractAndCopyCurrentSubtitle() {
    if (!quickExtractAndCopyBtn) return;
    const originalHtml = quickExtractAndCopyBtn.innerHTML;

    try {
      quickExtractAndCopyBtn.disabled = true;
      quickExtractAndCopyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" class="spin" style="width: 15px; height: 15px; fill: currentColor">
          <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
        </svg>
        <span>获取中...</span>
      `;

      // 1. 获取当前活动标签页
      let targetUrl = '';
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'getTabUrl' });
        if (resp?.url && isBilibiliUrl(resp.url)) {
          targetUrl = resp.url;
        }
      } catch (e) {
        console.warn('获取当前活动标签页异常:', e);
      }

      if (!targetUrl) {
        // 尝试兜底查询所有标签页里的 B 站视频
        const tabs = await chrome.tabs.query({});
        const biliTab = tabs.find((t) => isBilibiliUrl(t.url));
        if (biliTab?.url) {
          targetUrl = biliTab.url;
        }
      }

      if (!targetUrl || !isBilibiliUrl(targetUrl)) {
        showError('请先在浏览器中打开 B 站视频页面');
        resetButton(originalHtml);
        return;
      }

      // 2. 解析视频 ID 及分 P
      const videoId = extractBilibiliVideoId(targetUrl);
      if (!videoId) {
        showError('未识别到有效的 B 站视频地址');
        resetButton(originalHtml);
        return;
      }

      let pageNum = 1;
      try {
        const urlObj = new URL(targetUrl);
        const pParam = urlObj.searchParams.get('p');
        if (pParam && !isNaN(parseInt(pParam))) {
          pageNum = parseInt(pParam, 10);
        }
      } catch (e) {}

      // 3. 请求视频详情
      const videoInfo = await chrome.runtime.sendMessage({
        action: 'fetchBilibiliVideoInfo',
        videoId,
      });

      if (!videoInfo || !videoInfo.success) {
        showError(videoInfo?.message || '获取视频详情失败，请刷新重试');
        resetButton(originalHtml);
        return;
      }

      // 匹配分 P 信息
      let targetCid = videoInfo.cid;
      let targetTitle = videoInfo.title;
      const pages = Array.isArray(videoInfo.pages) ? videoInfo.pages : [];
      if (pageNum > 1 && pages.length >= pageNum) {
        const targetPage = pages[pageNum - 1];
        if (targetPage?.cid) {
          targetCid = targetPage.cid;
          if (targetPage.part) {
            targetTitle = `${videoInfo.title} P${pageNum} - ${targetPage.part}`;
          }
        }
      }

      if (!targetCid) {
        showError('获取视频 cid 失败');
        resetButton(originalHtml);
        return;
      }

      // 4. 获取字幕轨道
      const trackResp = await chrome.runtime.sendMessage({
        action: 'fetchBilibiliSubtitleTracks',
        cid: targetCid,
        bvid: videoInfo.bvid || videoId,
      });

      if (!trackResp || !trackResp.success || !Array.isArray(trackResp.subtitleTracks) || trackResp.subtitleTracks.length === 0) {
        showError(trackResp?.message || '该视频暂无可用字幕');
        resetButton(originalHtml);
        return;
      }

      // 5. 下载字幕内容
      const trackToUse = trackResp.subtitleTracks[0];
      const contentResp = await chrome.runtime.sendMessage({
        action: 'fetchBilibiliSubtitleContent',
        cid: targetCid,
        bvid: videoInfo.bvid || videoId,
        aid: trackResp.aid || videoInfo.aid,
        track: trackToUse,
      });

      if (!contentResp || !contentResp.success || !contentResp.subtitleText) {
        showError(contentResp?.message || '字幕内容解析为空');
        resetButton(originalHtml);
        return;
      }

      const txtContent = contentResp.subtitleText.trim();

      // 6. 复制到剪贴板
      await navigator.clipboard.writeText(txtContent);
      showSuccess('🎉 当前视频字幕已复制到剪贴板！');

      // 7. 更新界面预览反馈框
      if (quickExtractResult && quickExtractTitle) {
        quickExtractTitle.textContent = targetTitle || '当前视频字幕';
        if (quickExtractLength) {
          quickExtractLength.textContent = `${txtContent.length.toLocaleString()} 字`;
        }

        if (quickExtractPreview) {
          const previewSnippet = txtContent.slice(0, 350);
          quickExtractPreview.textContent = previewSnippet + (txtContent.length > 350 ? ' ...' : '');
          quickExtractPreview.style.display = 'block';
        }

        // 重置收起状态为展开
        setPreviewCollapsed(false);

        quickExtractResult.style.display = 'flex';
      }

      // 按钮状态变为成功
      quickExtractAndCopyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width: 15px; height: 15px; fill: currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>获取/复制成功</span>
      `;

      setTimeout(() => {
        resetButton(originalHtml);
      }, 2000);
    } catch (err) {
      console.error('一键提取字幕失败:', err);
      showError('提取失败: ' + (err.message || '未知错误'));
      resetButton(originalHtml);
    }
  }

  // ================= 预览区收起/展开与关闭控制 =================
  let isPreviewCollapsed = false;

  function setPreviewCollapsed(collapsed) {
    isPreviewCollapsed = collapsed;
    if (!quickExtractPreview || !quickExtractCollapseBtn || !quickExtractCollapseText) return;

    if (isPreviewCollapsed) {
      quickExtractPreview.classList.add('collapsed');
      quickExtractCollapseBtn.classList.add('collapsed');
      quickExtractCollapseText.textContent = '展开';
      quickExtractCollapseBtn.title = '展开字幕预览';
    } else {
      quickExtractPreview.classList.remove('collapsed');
      quickExtractCollapseBtn.classList.remove('collapsed');
      quickExtractCollapseText.textContent = '收起';
      quickExtractCollapseBtn.title = '收起字幕预览';
    }
  }

  if (quickExtractCollapseBtn) {
    quickExtractCollapseBtn.addEventListener('click', () => {
      setPreviewCollapsed(!isPreviewCollapsed);
    });
  }

  if (quickExtractCloseBtn) {
    quickExtractCloseBtn.addEventListener('click', () => {
      if (quickExtractResult) {
        quickExtractResult.style.display = 'none';
      }
    });
  }

  function resetButton(html) {
    if (quickExtractAndCopyBtn) {
      quickExtractAndCopyBtn.innerHTML = html;
      quickExtractAndCopyBtn.disabled = false;
    }
  }

  if (quickExtractAndCopyBtn) {
    quickExtractAndCopyBtn.addEventListener('click', quickExtractAndCopyCurrentSubtitle);
  }
});
