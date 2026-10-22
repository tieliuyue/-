/**
 * 幻星字幕下载 (Version 2) - 后台服务脚本
 * 专注核心：轻量、快速、稳定提取 B 站当前视频字幕
 */

// 点击图标打开侧边栏
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('setPanelBehavior error:', err);
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (error) {
    console.error('打开侧边栏失败:', error);
  }
});

// ================= Cookie 管理 =================
let bilibiliCookie = '';

chrome.storage.local.get(['bilibiliCookie'], (res) => {
  if (res?.bilibiliCookie) {
    bilibiliCookie = res.bilibiliCookie;
  }
});

/**
 * 获取浏览器中的 B 站 Cookies (包含 httpOnly，彻底杜绝 403)
 */
async function getAllBilibiliCookies() {
  const domains = ['.bilibili.com', 'www.bilibili.com', 'bilibili.com'];
  let allCookies = [];

  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      allCookies = allCookies.concat(cookies);
    } catch (e) {
      console.warn(`获取 ${domain} cookies 失败:`, e);
    }
  }

  // 合并存储中的自定义 cookie
  let storedCookie = bilibiliCookie;
  if (!storedCookie) {
    try {
      const result = await chrome.storage.local.get(['bilibiliCookie']);
      storedCookie = result.bilibiliCookie || '';
    } catch (e) {}
  }

  if (storedCookie) {
    const pairs = storedCookie.split(';');
    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const name = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (name) allCookies.push({ name, value });
    }
  }

  // 去重
  const uniqueMap = new Map();
  for (const c of allCookies) {
    uniqueMap.set(c.name, c.value);
  }

  return Array.from(uniqueMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ================= MD5 & Wbi 签名 =================
function md5(string) {
  function RotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function AddUnsigned(lX, lY) {
    var lX4, lY4, lX8, lY8, lResult;
    lX8 = lX & 0x80000000;
    lY8 = lY & 0x80000000;
    lX4 = lX & 0x40000000;
    lY4 = lY & 0x40000000;
    lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      return lResult ^ 0x40000000 ^ lX8 ^ lY8;
    }
    return lResult ^ lX8 ^ lY8;
  }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }
  function GG(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }
  function HH(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }
  function II(a, b, c, d, x, s, ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }
  function ConvertToWordArray(string) {
    var lWordCount;
    var lMessageLength = string.length;
    var lNumberOfWords_temp1 = lMessageLength + 8;
    var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
    var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    var lWordArray = Array(lNumberOfWords - 1);
    var iBytePosition = 0;
    var iByteCount = 0;
    while (iByteCount < lMessageLength) {
      lWordCount = (iByteCount - (iByteCount % 4)) / 4;
      iBytePosition = (iByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (string.charCodeAt(iByteCount) << iBytePosition);
      iByteCount++;
    }
    lWordCount = (iByteCount - (iByteCount % 4)) / 4;
    iBytePosition = (iByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << iBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }
  function WordToHex(lValue) {
    var WordToHexValue = '', WordToHexValue_temp = '', lByte, lCount;
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;
      WordToHexValue_temp = '0' + lByte.toString(16);
      WordToHexValue += WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
    }
    return WordToHexValue;
  }
  var x = ConvertToWordArray(string);
  var k, AA, BB, CC, DD, a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
  for (k = 0; k < x.length; k += 16) {
    AA = a; BB = b; CC = c; DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
    a = AddUnsigned(a, AA);
    b = AddUnsigned(b, BB);
    c = AddUnsigned(c, CC);
    d = AddUnsigned(d, DD);
  }
  return (WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d)).toLowerCase();
}

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41,
  13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34,
  44, 52,
];

function getMixinKey(orig) {
  let temp = '';
  mixinKeyEncTab.forEach((n) => { temp += orig[n]; });
  return temp.slice(0, 32);
}

function encWbi(params, img_key, sub_key) {
  const mixin_key = getMixinKey(img_key + sub_key);
  const curr_time = Math.round(Date.now() / 1000);
  const chr_filter = /[!'()*]/g;
  Object.assign(params, { wts: curr_time });
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      const value = params[key].toString().replace(chr_filter, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
  const wbi_sign = md5(query + mixin_key);
  return query + '&w_rid=' + wbi_sign;
}

let cachedWbiKeys = null;
let cachedWbiKeysAt = 0;

async function getWbiKeys() {
  const now = Date.now();
  if (cachedWbiKeys && now - cachedWbiKeysAt < 10 * 60 * 1000) {
    return cachedWbiKeys;
  }
  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.bilibili.com/',
    },
  });
  const json = await res.json();
  const img_url = json?.data?.wbi_img?.img_url;
  const sub_url = json?.data?.wbi_img?.sub_url;
  if (!img_url || !sub_url) {
    throw new Error('获取Wbi签名密钥失败');
  }
  cachedWbiKeys = {
    img_key: img_url.substring(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
    sub_key: sub_url.substring(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.')),
  };
  cachedWbiKeysAt = now;
  return cachedWbiKeys;
}

// ================= 网络请求 =================
async function fetchWithBiliHeaders(url) {
  const cookies = await getAllBilibiliCookies();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Origin: 'https://www.bilibili.com',
    Referer: 'https://www.bilibili.com/',
    'Cache-Control': 'no-cache',
    'X-Wbi-UA': 'Win32.Chrome.120.0.0.0',
  };
  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`);
  }
  return await response.json();
}

// ================= 核心业务：获取视频详情 =================
async function getBilibiliVideoInfo(videoId) {
  try {
    const isBV = videoId.startsWith('BV');
    const wbiKeys = await getWbiKeys();
    const params = {
      ...(isBV ? { bvid: videoId } : { aid: videoId.replace('av', '') }),
      need_elec: 0,
    };
    const query = encWbi(params, wbiKeys.img_key, wbiKeys.sub_key);
    const apiUrl = `https://api.bilibili.com/x/web-interface/wbi/view/detail?${query}`;

    const detailData = await fetchWithBiliHeaders(apiUrl);
    if (detailData.code === 0 && detailData.data) {
      const viewData = detailData.data.View || {};
      const pages = Array.isArray(viewData.pages) ? viewData.pages : [];
      const cid = viewData.cid || pages[0]?.cid;
      const title = viewData.title || '';
      const aid = viewData.aid || 0;
      const bvid = viewData.bvid || videoId;

      return {
        success: true,
        title,
        aid,
        bvid,
        cid,
        pages,
        full_data: detailData.data,
      };
    } else {
      return {
        success: false,
        message: detailData.message || '获取视频详情失败',
      };
    }
  } catch (err) {
    console.error('获取视频详情异常:', err);
    return {
      success: false,
      message: err.message || '网络请求错误',
    };
  }
}

// ================= 核心业务：获取字幕轨道列表 =================
async function getBilibiliSubtitleTracks(cid, bvid) {
  try {
    // 首先获取 aid（如果未能获得）
    let aid = null;
    try {
      const info = await getBilibiliVideoInfo(bvid);
      if (info.success) aid = info.aid;
    } catch (e) {}

    const subtitleInfoUrl = aid
      ? `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`
      : `https://api.bilibili.com/x/player/v2?cid=${cid}&bvid=${bvid}`;

    const subtitleInfoData = await fetchWithBiliHeaders(subtitleInfoUrl);

    if (subtitleInfoData.code !== 0 || !subtitleInfoData.data) {
      return {
        success: false,
        message: subtitleInfoData.message || '获取字幕信息失败',
      };
    }

    const subtitles = subtitleInfoData.data.subtitle?.subtitles || [];
    if (subtitles.length === 0) {
      return {
        success: false,
        message: '该视频暂无可用字幕',
      };
    }

    const subtitleTracks = subtitles.map((sub, index) => ({
      trackId: sub.id_str || String(sub.id || index),
      lan: sub.lan || '',
      lan_doc: sub.lan_doc || '字幕',
      subtitle_url: sub.subtitle_url || '',
      type: sub.type,
    }));

    return {
      success: true,
      aid,
      cid,
      bvid,
      subtitleTracks,
    };
  } catch (err) {
    console.error('获取字幕轨道失败:', err);
    return {
      success: false,
      message: err.message || '获取字幕轨道失败',
    };
  }
}

// ================= 核心业务：下载并解析字幕内容 =================
function formatSubtitleUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

async function getBilibiliSubtitleContentByTrack({ cid, bvid, aid, track }) {
  try {
    let subtitleUrl = formatSubtitleUrl(track?.subtitle_url);

    if (!subtitleUrl && track?.lan?.startsWith('ai-') && aid && cid) {
      const aiUrl = `https://api.bilibili.com/x/player/v2/ai/subtitle/search/stat?aid=${aid}&cid=${cid}`;
      const aiData = await fetchWithBiliHeaders(aiUrl);
      if (aiData.code === 0 && aiData.data?.subtitle_url) {
        subtitleUrl = formatSubtitleUrl(aiData.data.subtitle_url);
      }
    }

    if (!subtitleUrl) {
      return { success: false, message: '未找到字幕下载地址' };
    }

    const cookies = await getAllBilibiliCookies();
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://www.bilibili.com/',
    };
    if (cookies) headers['Cookie'] = cookies;

    let res = await fetch(subtitleUrl, { headers, credentials: 'include' });
    if (!res.ok) {
      // 简化重试
      res = await fetch(subtitleUrl);
    }

    if (!res.ok) {
      return { success: false, message: `字幕文件下载失败: HTTP ${res.status}` };
    }

    const json = await res.json();
    const body = json?.body || [];

    if (!Array.isArray(body) || body.length === 0) {
      return { success: false, message: '字幕内容为空' };
    }

    // 格式化纯文本
    const plainText = body
      .map((item) => (item.content || '').trim())
      .filter(Boolean)
      .join('\n');

    return {
      success: true,
      subtitles: body,
      subtitleText: plainText,
      metadata: {
        lan: track?.lan || '',
        lan_doc: track?.lan_doc || '字幕',
      },
    };
  } catch (err) {
    console.error('解析字幕内容失败:', err);
    return {
      success: false,
      message: err.message || '解析字幕内容失败',
    };
  }
}

// ================= 消息分发 =================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getTabUrl') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || null });
    });
    return true;
  }

  if (message.action === 'fetchBilibiliVideoInfo') {
    getBilibiliVideoInfo(message.videoId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (message.action === 'fetchBilibiliSubtitleTracks') {
    getBilibiliSubtitleTracks(message.cid, message.bvid)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (message.action === 'fetchBilibiliSubtitleContent') {
    getBilibiliSubtitleContentByTrack(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }
});
