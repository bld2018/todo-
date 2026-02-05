// ==================== 全局错误处理 ====================
window.addEventListener('error', (event) => {
    console.error('🚨 全局错误:', event.error);
    showToast('发生错误: ' + event.error.message, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 未处理的Promise拒绝:', event.reason);
    showToast('异步操作失败: ' + event.reason, 'error');
});

// ==================== Toast通知函数 ====================
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        ${type === 'error' ? 'background: #ff4d4f;' : type === 'warning' ? 'background: #faad14;' : 'background: #52c41a;'}
    `;
    toast.textContent = `${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅'} ${message}`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

// ==================== 全局变量 ====================
let currentUser = null;
let participants = [];
let pendingDeleteId = null;
let allCombinations = [];
let combinationCache = new Map();
let lastParticipantsHash = '';
let isCalculating = false;
let matchWorker = null;
let currentRequestId = 0;

// ==================== 性能优化工具函数 ====================
function getParticipantsHash(participantsList) {
    return participantsList.map(p => `${p.id}-${p.name}-${p.score}`).sort().join('|');
}

function getCachedCombinations(participantsList) {
    const hash = getParticipantsHash(participantsList);
    if (combinationCache.has(hash)) {
        console.log('🎯 使用缓存的组合结果');
        return combinationCache.get(hash);
    }
    return null;
}

function cacheCombinations(participantsList, combinations) {
    const hash = getParticipantsHash(participantsList);
    combinationCache.set(hash, combinations);
    console.log('💾 缓存组合结果');
    
    // 限制缓存大小
    if (combinationCache.size > 10) {
        const firstKey = combinationCache.keys().next().value;
        combinationCache.delete(firstKey);
    }
}

// ==================== Web Worker管理 ====================
function initMatchWorker() {
    if (window.Worker && !matchWorker) {
        try {
            matchWorker = new Worker('match-worker.js');
            console.log('✅ Web Worker初始化成功');
            
            matchWorker.onmessage = handleWorkerMessage;
            matchWorker.onerror = (error) => {
                console.error('❌ Worker错误:', error);
                showToast('计算线程出错，将使用备用方案', 'error');
                isCalculating = false;
                showDetailedLoadingState(false);
            };
        } catch (e) {
            console.warn('⚠️ Web Worker不支持:', e);
        }
    }
    return !!matchWorker;
}

function handleWorkerMessage(e) {
    const { type, requestId, progress, message, results, duration } = e.data;
    
    // 检查是否是当前请求
    if (requestId !== currentRequestId) return;
    
    if (type === 'progress') {
        updateLoadingProgress(progress, message);
    } else if (type === 'complete') {
        console.log(`✅ Worker计算完成，耗时: ${duration?.toFixed(2)}ms`);
        allCombinations = results || [];
        cacheCombinations(participants, allCombinations);
        renderMatchResult(allCombinations);
        showDetailedLoadingState(false);
        setButtonLoading('matchTeamsBtn', false);
        isCalculating = false;
        
        if (allCombinations.length > 0) {
            showToast(`✅ 找到 ${allCombinations.length} 个完美组合！`, 'success');
        } else {
            showToast('⚠️ 未找到匹配组合', 'warning');
        }
    }
}

function terminateWorker() {
    if (matchWorker) {
        matchWorker.terminate();
        matchWorker = null;
        console.log('🛑 Worker已终止');
    }
}

// ==================== 智能加载状态管理 ====================
function showLoadingState(show = true, message = '数据加载中...', progress = 0) {
    const loadingElement = document.getElementById('globalLoadingIndicator');
    if (!loadingElement) return;
    
    if (show) {
        loadingElement.style.display = 'flex';
        updateLoadingProgress(progress, message);
    } else {
        loadingElement.style.display = 'none';
    }
}

function updateLoadingProgress(progress, message) {
    const progressBar = document.getElementById('progressBar');
    const loadingText = document.getElementById('loadingText');
    const progressPercent = document.getElementById('progressPercent');
    
    if (progressBar) progressBar.style.width = `${Math.min(100, progress)}%`;
    if (loadingText) loadingText.textContent = message;
    if (progressPercent) progressPercent.textContent = `${Math.round(progress)}%`;
}

function showDetailedLoadingState(show = true, message = '计算中...', progress = 0) {
    showLoadingState(show, message, progress);
}

function setButtonLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    if (button) {
        if (loading) {
            button.classList.add('btn-loading');
            button.disabled = true;
            button.innerHTML = '<span class="btn-icon">⏳</span> 计算中...';
        } else {
            button.classList.remove('btn-loading');
            button.disabled = false;
            button.innerHTML = '<span class="btn-icon">🔍</span> 立即查找所有组合';
        }
    }
}

// ==================== 智能重试工具函数 ====================
async function smartRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const result = await operation();
            if (result && result.error) {
                lastError = result.error;
                if (i < maxRetries) {
                    const delay = (Math.pow(2, i) * baseDelay) + (Math.random() * 1000);
                    console.log(`🔁 第 ${i + 1} 次重试，${Math.round(delay)}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } else {
                if (i > 0) console.log(`✅ 操作在第 ${i + 1} 次尝试后成功`);
                return result;
            }
        } catch (error) {
            lastError = error;
            if (i < maxRetries) {
                const delay = (Math.pow(2, i) * baseDelay) + (Math.random() * 1000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化Web Worker
    initMatchWorker();
    
    // 检查 Supabase 是否就绪
    if (typeof isSupabaseReady === 'function' && !isSupabaseReady()) {
        alert('❌ 数据库未连接！请检查 config.js 配置');
        return;
    }
    
    // 绑定所有事件监听器
    bindEventListeners();
    
    checkLoginStatus();
    showLoadingState(true, '系统初始化中...');
    
    try {
        await loadParticipants();
    } catch (error) {
        console.error('初始化失败:', error);
        showToast('系统初始化失败，请刷新页面重试', 'error');
    } finally {
        showLoadingState(false);
    }
    
    // 回车键提交
    document.getElementById('nameInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('scoreInput')?.focus();
    });
    
    document.getElementById('scoreInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });
});

// 绑定事件监听器
function bindEventListeners() {
    console.log('🔗 开始绑定事件监听器');
    
    // 管理后台按钮（导航栏上的按钮）- 使用正确的ID选择器
    const navAdminBtn = document.getElementById('adminLoginBtn');
    if (navAdminBtn) {
        // 移除可能存在的旧事件监听器
        navAdminBtn.replaceWith(navAdminBtn.cloneNode(true));
        const newNavAdminBtn = document.getElementById('adminLoginBtn');
        newNavAdminBtn.addEventListener('click', showAdminLogin);
        console.log('✅ 导航栏管理后台按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到导航栏管理后台按钮 (adminLoginBtn)');
    }
    
    // 添加参与者按钮
    const addParticipantBtn = document.getElementById('addParticipantBtn');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', addParticipant);
        console.log('✅ 添加参与者按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到添加参与者按钮');
    }
    
    // 匹配团队按钮
    const matchTeamsBtn = document.getElementById('matchTeamsBtn');
    if (matchTeamsBtn) {
        matchTeamsBtn.addEventListener('click', matchTeams);
        console.log('✅ 匹配团队按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到匹配团队按钮');
    }
    
    // 按分数查找按钮
    const searchUsersBtn = document.getElementById('searchUsersBtn');
    if (searchUsersBtn) {
        searchUsersBtn.addEventListener('click', searchUsersByScore);
        console.log('✅ 按分数查找按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到按分数查找按钮 (searchUsersBtn)');
    }
    
    // 清空分数查找按钮
    const clearScoreSearchBtn = document.getElementById('clearScoreSearchBtn');
    if (clearScoreSearchBtn) {
        clearScoreSearchBtn.addEventListener('click', clearScoreSearch);
        console.log('✅ 清空分数查找按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到清空分数查找按钮 (clearScoreSearchBtn)');
    }
    
    // 按小红书号查询按钮
    const queryCombinationsBtn = document.getElementById('queryCombinationsBtn');
    if (queryCombinationsBtn) {
        queryCombinationsBtn.addEventListener('click', queryCombinations);
        console.log('✅ 按小红书号查询按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到按小红书号查询按钮 (queryCombinationsBtn)');
    }
    
    // 清空查询按钮
    const clearQueryBtn = document.getElementById('clearQueryBtn');
    if (clearQueryBtn) {
        clearQueryBtn.addEventListener('click', clearQuery);
        console.log('✅ 清空查询按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到清空查询按钮 (clearQueryBtn)');
    }
    
    // 管理员登录模态框中的登录按钮
    const performAdminLoginBtn = document.getElementById('performAdminLoginBtn');
    if (performAdminLoginBtn) {
        performAdminLoginBtn.addEventListener('click', performAdminLogin);
        console.log('✅ 管理员登录按钮事件绑定成功');
    } else {
        console.warn('⚠️ 未找到管理员登录按钮 (performAdminLoginBtn)');
    }
    
    // 关闭模态框事件
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                // 清除错误信息
                const errorElements = modal.querySelectorAll('.error-message');
                errorElements.forEach(el => {
                    el.style.display = 'none';
                    el.textContent = '';
                });
            }
        });
    });
    
    // 点击模态框背景关闭
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
            // 清除错误信息
            const errorElements = e.target.querySelectorAll('.error-message');
            errorElements.forEach(el => {
                el.style.display = 'none';
                el.textContent = '';
            });
        }
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (modal.style.display === 'flex') {
                    modal.style.display = 'none';
                    // 清除错误信息
                    const errorElements = modal.querySelectorAll('.error-message');
                    errorElements.forEach(el => {
                        el.style.display = 'none';
                        el.textContent = '';
                    });
                }
            });
        }
    });
    
    // 回车键提交表单
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    
    if (adminUsernameInput) {
        adminUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminPasswordInput?.focus();
        });
    }
    
    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const loginBtn = document.getElementById('performAdminLoginBtn');
                if (loginBtn && !loginBtn.disabled) {
                    performAdminLogin();
                }
            }
        });
    }
    
    // 保持原有的回车事件
    const nameInput = document.getElementById('nameInput');
    const scoreInput = document.getElementById('scoreInput');
    
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') scoreInput?.focus();
        });
    }
    
    if (scoreInput) {
        scoreInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addParticipant();
        });
    }
    
    // 分数查找输入框回车事件
    const scoreSearchInput = document.getElementById('scoreSearchInput');
    if (scoreSearchInput) {
        scoreSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchUsersByScore();
        });
        console.log('✅ 分数查找输入框回车事件绑定成功');
    }
    
    // 小红书号查询输入框回车事件
    const queryNameInput = document.getElementById('queryNameInput');
    if (queryNameInput) {
        queryNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') queryCombinations();
        });
        console.log('✅ 小红书号查询输入框回车事件绑定成功');
    }
    
    console.log('🔗 事件监听器绑定完成');
}

// ==================== 登录状态管理 ====================
function checkLoginStatus() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('👤 已登录用户:', currentUser.username);
            updateUIForLoggedInUser();
        } catch (e) {
            console.error('解析用户信息失败:', e);
            localStorage.removeItem('currentUser');
        }
    }
}

function updateUIForLoggedInUser() {
    const userStatusEl = document.getElementById('userStatus');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    
    if (userStatusEl && adminLoginBtn && currentUser) {
        if (currentUser.role === 'admin') {
            userStatusEl.textContent = `👤 ${currentUser.username} (管理员)`;
            userStatusEl.style.display = 'inline';
        } else {
            userStatusEl.textContent = `👤 ${currentUser.username}`;
            userStatusEl.style.display = 'inline';
        }
    }
    
    // 确保管理后台按钮有点击事件
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', showAdminLogin);
    }
}

function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'block';
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.style.display = 'none';
}

function login() {
    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value.trim();
    
    if (!username || !password) {
        showToast('请输入用户名和密码', 'error');
        return;
    }
    
    if (username === 'admin' && password === 'admin123') {
        currentUser = { username: 'admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        closeLoginModal();
        updateUIForLoggedInUser();
        showToast('登录成功！', 'success');
    } else {
        showToast('用户名或密码错误', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    location.reload();
}

// ==================== 小红书号验证函数 ====================
function isValidXiaohongshuId(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length >= 3;
}

function getXiaohongshuIdStyle(name) {
    if (name && name.toUpperCase() === 'TEST') {
        return 'color: #ff4d4f; font-weight: bold; background: #fff1f0; padding: 2px 6px; border-radius: 4px;';
    }
    return '';
}

// ==================== 参与者管理 ====================
async function loadParticipants() {
    try {
        console.time('加载参与者数据');
        
        if (typeof supabaseClient === 'undefined') {
            console.warn('Supabase未初始化');
            participants = [];
            renderParticipants();
            return;
        }
        
        const { data, error } = await smartRetry(async () => {
            return await supabaseClient
                .from('participants')
                .select('*')
                .order('created_at', { ascending: false });
        }, 3, 1000);
        
        if (error) throw error;
        
        participants = data || [];
        console.log(`📥 加载了 ${participants.length} 个参与者`);
        
        const currentHash = getParticipantsHash(participants);
        if (currentHash !== lastParticipantsHash) {
            console.log('🔄 参与者列表已变更，清空缓存');
            allCombinations = [];
            combinationCache.clear();
            lastParticipantsHash = currentHash;
        }
        
        renderParticipants();
        updateCount();
        console.timeEnd('加载参与者数据');
    } catch (error) {
        console.error('❌ 加载参与者失败:', error);
        showToast('数据加载失败，请检查网络连接', 'error');
    }
}

async function addParticipant() {
    const nameInput = document.getElementById('nameInput');
    const scoreInput = document.getElementById('scoreInput');
    
    const name = nameInput?.value.trim();
    const score = parseInt(scoreInput?.value);
    
    if (!name) {
        showToast('请输入小红书号', 'error');
        nameInput?.focus();
        return;
    }
    
    if (!isValidXiaohongshuId(name)) {
        if (!confirm('⚠️ 检测到您输入的可能不是标准小红书数字ID，是否继续添加？')) {
            return;
        }
    }
    
    if (isNaN(score) || score < 350 || score > 950) {
        showToast('芝麻分必须在350-950之间', 'error');
        scoreInput?.focus();
        return;
    }
    
    try {
        showLoadingState(true, '添加参与者中...');
        
        const participantId = 'P' + String(Date.now()).slice(-6);
        
        if (typeof supabaseClient !== 'undefined') {
            const { error } = await smartRetry(async () => {
                return await supabaseClient
                    .from('participants')
                    .insert([{
                        id: participantId,
                        name: name,
                        score: score,
                        created_at: new Date().toISOString()
                    }]);
            }, 3, 1000);
            
            if (error) throw error;
        }
        
        // 添加到本地数组
        participants.unshift({ id: participantId, name, score, created_at: new Date().toISOString() });
        
        // 清空缓存
        combinationCache.clear();
        allCombinations = [];
        
        renderParticipants();
        updateCount();
        
        nameInput.value = '';
        scoreInput.value = '';
        nameInput.focus();
        
        showToast(`✅ ${name} 已添加`, 'success');
    } catch (error) {
        console.error('添加失败:', error);
        showToast('添加失败，请重试', 'error');
    } finally {
        showLoadingState(false);
    }
}

function renderParticipants() {
    const listEl = document.getElementById('participantsList');
    if (!listEl) return;
    
    if (participants.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>暂无参与者</p>
                <p class="empty-text">请在左侧添加参与者信息</p>
            </div>
        `;
        return;
    }
    
    listEl.innerHTML = participants.map(p => {
        const nameStyle = getXiaohongshuIdStyle(p.name);
        const warningIcon = !isValidXiaohongshuId(p.name) ? '⚠️ ' : '';
        
        return `
        <div class="participant-item">
            <div>
                <span class="participant-id">${p.id}</span>
                <span class="participant-name" style="${nameStyle}">${warningIcon}${p.name}</span>
                <span class="participant-score">${p.score}</span>
            </div>
            <button class="btn-remove" onclick="showAdminApprovalRequired()">
                🗑️ 删除
            </button>
        </div>
    `;
    }).join('');
}

function updateCount() {
    const countEl = document.getElementById('participantCount');
    if (countEl) {
        countEl.textContent = participants.length;
        countEl.setAttribute('aria-label', `当前共有 ${participants.length} 个参与者`);
        console.log(`🔢 更新参与者计数: ${participants.length}`);
    } else {
        console.warn('⚠️ 未找到参与者计数元素 (id: participantCount)');
    }
}

// ==================== 匹配功能 - 双指针优化 ====================

async function matchTeams() {
    if (participants.length < 3) {
        showToast('至少需要3个参与者才能匹配', 'error');
        return;
    }
    
    if (isCalculating) {
        showToast('计算正在进行中，请稍候...', 'warning');
        return;
    }
    
    isCalculating = true;
    currentRequestId++;
    
    try {
        // 检查缓存
        const cached = getCachedCombinations(participants);
        if (cached) {
            allCombinations = cached;
            renderMatchResult(cached);
            showToast(`✅ 使用缓存结果，共 ${cached.length} 个组合`, 'success');
            isCalculating = false;
            return;
        }
        
        setButtonLoading('matchTeamsBtn', true);
        showDetailedLoadingState(true, '正在初始化计算...', 0);
        
        // 优先使用Web Worker
        if (initMatchWorker()) {
            console.log('🚀 使用Web Worker计算');
            matchWorker.postMessage({
                participants: participants.map(p => ({ id: p.id, name: p.name, score: p.score })),
                targetScore: TARGET_SCORE,
                requestId: currentRequestId
            });
        } else {
            // 降级到主线程双指针算法
            console.log('⚠️ 降级到主线程计算');
            await calculateInMainThread();
        }
        
    } catch (error) {
        console.error('匹配计算失败:', error);
        showToast('匹配计算失败，请重试', 'error');
        isCalculating = false;
        setButtonLoading('matchTeamsBtn', false);
        showDetailedLoadingState(false);
    }
}

/**
 * 主线程双指针计算（降级方案）
 */
async function calculateInMainThread() {
    const results = [];
    const n = participants.length;
    
    // 创建排序副本
    const sorted = [...participants].map((p, idx) => ({ ...p, originalIndex: idx }))
        .sort((a, b) => a.score - b.score);
    
    updateLoadingProgress(10, '开始双指针搜索...');
    
    // 双指针查找
    for (let i = 0; i < n - 2; i++) {
        // 跳过重复
        if (i > 0 && sorted[i].score === sorted[i-1].score) continue;
        
        // 剪枝
        const minSum = sorted[i].score + sorted[i+1].score + sorted[i+2].score;
        if (minSum > TARGET_SCORE) break;
        
        const maxSum = sorted[i].score + sorted[n-2].score + sorted[n-1].score;
        if (maxSum < TARGET_SCORE) continue;
        
        let left = i + 1;
        let right = n - 1;
        
        while (left < right) {
            const sum = sorted[i].score + sorted[left].score + sorted[right].score;
            
            if (sum === TARGET_SCORE) {
                results.push({
                    members: [sorted[i], sorted[left], sorted[right]],
                    totalScore: TARGET_SCORE
                });
                
                while (left < right && sorted[left].score === sorted[left+1].score) left++;
                while (left < right && sorted[right].score === sorted[right-1].score) right--;
                
                left++;
                right--;
            } else if (sum < TARGET_SCORE) {
                left++;
            } else {
                right--;
            }
        }
        
        // 更新进度
        if (i % Math.ceil(n / 20) === 0) {
            const progress = Math.floor((i / (n - 2)) * 80) + 10;
            updateLoadingProgress(progress, `正在计算... (${results.length}个已找到)`);
            await new Promise(r => setTimeout(r, 0)); // 让出主线程
        }
    }
    
    updateLoadingProgress(95, '正在保存结果...');
    
    allCombinations = results;
    cacheCombinations(participants, results);
    renderMatchResult(results);
    
    updateLoadingProgress(100, '计算完成！');
    showDetailedLoadingState(false);
    setButtonLoading('matchTeamsBtn', false);
    isCalculating = false;
    
    if (results.length > 0) {
        showToast(`✅ 找到 ${results.length} 个完美组合！`, 'success');
    } else {
        showToast('⚠️ 未找到匹配组合', 'warning');
    }
}

function renderMatchResult(combos) {
    const resultEl = document.getElementById('matchResult');
    const queryResultEl = document.getElementById('queryResult');
    
    if (queryResultEl) queryResultEl.style.display = 'none';
    
    if (!resultEl) return;
    
    if (combos.length === 0) {
        resultEl.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #fa8c16;">
                <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                <h3 style="margin-bottom: 15px;">未找到精准匹配</h3>
                <p>未找到总分恰好等于${TARGET_SCORE}的3人组合</p>
                <p style="margin-top: 15px; color: #8c8c8c;">
                    建议添加更多参与者或调整分数
                </p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="text-align: center; margin-bottom: 25px;">
            <div style="font-size: 2.5rem; color: #52c41a; font-weight: bold; margin-bottom: 10px;">
                🎉 找到 ${combos.length} 个完美组合！
            </div>
            <div style="color: #8c8c8c;">总分恰好等于${TARGET_SCORE}分</div>
        </div>
    `;
    
    combos.forEach((combo, index) => {
        const membersHtml = combo.members.map(member => {
            const nameStyle = getXiaohongshuIdStyle(member.name);
            const warningIcon = !isValidXiaohongshuId(member.name) ? '⚠️ ' : '';
            return `
            <div class="member-item">
                <div class="member-id">${member.id}</div>
                <div class="member-name" style="${nameStyle}">${warningIcon}${member.name}</div>
                <div class="member-score">${member.score}</div>
            </div>
        `;
        }).join('');
        
        html += `
            <div class="combo-card">
                <div class="combo-header">
                    <div class="combo-index">组合 #${index + 1}</div>
                    <div class="combo-total">${TARGET_SCORE} 分</div>
                </div>
                <div class="combo-members">
                    ${membersHtml}
                </div>
            </div>
        `;
    });
    
    resultEl.innerHTML = html;
}

// ==================== 查询组合功能 ====================
function queryCombinations() {
    console.log('🔍 执行按小红书号查找');
    
    const queryInput = document.getElementById('queryNameInput');
    const queryName = queryInput?.value.trim();
    
    // 输入验证
    if (!queryInput || !queryName) {
        showToast('请输入要查找的小红书号', 'error');
        queryInput?.focus();
        return;
    }
    
    // 验证小红书号格式
    if (!isValidXiaohongshuId(queryName)) {
        showToast('请输入有效的小红书号格式', 'error');
        queryInput?.focus();
        return;
    }
    
    console.log(`🔍 查找包含用户 "${queryName}" 的组合`);
    
    // 检查是否已有匹配结果
    if (allCombinations.length === 0) {
        showToast('请先执行匹配计算，然后进行查询', 'warning');
        if (confirm('是否立即执行匹配计算？')) {
            matchTeams();
            // 延迟执行查询，等待匹配完成
            setTimeout(() => {
                if (allCombinations.length > 0) {
                    performQueryByName(queryName);
                } else {
                    showToast('匹配计算仍在进行中，请稍后重试', 'warning');
                }
            }, 3000);
        }
        return;
    }
    
    // 执行查询
    performQueryByName(queryName);
}

function performQueryByName(queryName) {
    console.log(`🔍 在 ${allCombinations.length} 个组合中查找包含 "${queryName}" 的组合`);
    
    // 二次查询：在已有的匹配结果中查找包含指定用户的组合
    const filtered = allCombinations.filter(combo => 
        combo.members.some(member => member.name === queryName)
    );
    
    console.log(`🔍 找到 ${filtered.length} 个包含 "${queryName}" 的组合`);
    
    // 显示查询结果
    renderQueryResultByName(filtered, queryName);
    
    // 给予用户反馈
    if (filtered.length > 0) {
        showToast(`✅ 找到 ${filtered.length} 个包含 "${queryName}" 的组合`, 'success');
    } else {
        showToast(`⚠️ 未找到包含 "${queryName}" 的组合`, 'warning');
    }
}

function renderQueryResultByName(combos, queryName) {
    const resultEl = document.getElementById('queryResult');
    const matchResultEl = document.getElementById('matchResult');
    
    // 隐藏匹配结果，显示查询结果
    if (matchResultEl) matchResultEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'block';
    
    if (combos.length === 0) {
        resultEl.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #fa8c16;">
                <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                <h3>未找到包含 "${queryName}" 的组合</h3>
                <p>在当前的 ${allCombinations.length} 个匹配组合中未找到包含此用户的结果</p>
                <div style="margin: 20px 0;">
                    <button class="btn btn-primary" onclick="matchTeams()" style="margin-right: 10px;">
                        🔄 重新匹配
                    </button>
                    <button class="btn btn-outline" onclick="clearQuery()">
                        ← 返回全部结果
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    // 构建成功结果HTML - 与匹配结果格式统一
    let html = `
        <div style="text-align: center; margin-bottom: 25px;">
            <div style="font-size: 2.5rem; color: #52c41a; font-weight: bold; margin-bottom: 10px;">
                🎯 找到 ${combos.length} 个包含 "${queryName}" 的组合
            </div>
            <div style="color: #8c8c8c; margin-top: 10px;">
                在 ${allCombinations.length} 个总匹配组合中筛选
            </div>
        </div>
    `;
    
    // 为每个匹配的组合生成卡片 - 调整布局，分数放在ID下方，目标用户用黄色背景标记
    combos.forEach((combo, index) => {
        const membersHtml = combo.members.map(member => {
            const isTarget = member.name === queryName;
            const nameStyle = getXiaohongshuIdStyle(member.name);
            const warningIcon = !isValidXiaohongshuId(member.name) ? '⚠️ ' : '';
            
            return `
                <div class="member-item" style="
                    padding: 12px;
                    border: 1px solid #d9d9d9;
                    border-radius: 6px;
                    margin-bottom: 8px;
                    background: ${isTarget ? '#fffbe6' : 'white'};
                    transition: all 0.3s;
                    position: relative;
                " onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
                    ${isTarget ? `
                        <div style="
                            position: absolute;
                            top: -8px;
                            right: -8px;
                            background: #ff4d4f;
                            color: white;
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-weight: bold;
                            font-size: 0.7rem;
                        ">!</div>
                    ` : ''}
                    <div style="text-align: center;">
                        <div class="member-id" style="
                            font-weight: bold; 
                            color: #1890ff;
                            margin-bottom: 4px;
                        ">${member.id}</div>
                        <div class="member-score" style="
                            font-size: 1.2rem;
                            font-weight: bold;
                            color: #1677ff;
                            margin-bottom: 8px;
                        ">${member.score}分</div>
                        <div class="member-name" style="
                            ${isTarget ? 'color: #d48806; font-weight: bold; background: #fffbe6; padding: 4px 8px; border-radius: 4px;' : ''}
                            ${nameStyle}
                        ">${warningIcon}${member.name}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        html += `
            <div class="combo-card">
                <div class="combo-header">
                    <div class="combo-index">组合 #${index + 1}</div>
                    <div class="combo-total">${TARGET_SCORE} 分</div>
                </div>
                <div class="combo-members">
                    ${membersHtml}
                </div>
            </div>
        `;
    });
    
    // 添加返回按钮
    html += `
        <div style="text-align: center; margin-top: 25px;">
            <button class="btn btn-outline" onclick="clearQuery()" style="padding: 10px 25px;">
                <span class="btn-icon">←</span> 返回全部结果
            </button>
        </div>
    `;
    
    resultEl.innerHTML = html;
}

function clearQuery() {
    const queryInput = document.getElementById('queryNameInput');
    const queryResultEl = document.getElementById('queryResult');
    const matchResultEl = document.getElementById('matchResult');
    
    if (queryInput) queryInput.value = '';
    if (queryResultEl) queryResultEl.style.display = 'none';
    if (matchResultEl) matchResultEl.style.display = 'block';
}

// ==================== 按分数查找用户 ====================
function searchUsersByScore() {
    console.log('🔍 执行按分数查找');
    
    const scoreInput = document.getElementById('scoreSearchInput');
    const resultContainer = document.getElementById('scoreSearchResult');
    
    // 输入验证
    const score = parseInt(scoreInput?.value);
    
    if (!scoreInput || !scoreInput.value.trim()) {
        showToast('请输入要查找的芝麻分数', 'error');
        scoreInput?.focus();
        return;
    }
    
    if (isNaN(score) || score < 1 || score > 2026) {
        showToast('请输入有效的芝麻分数（1-2026之间）', 'error');
        scoreInput?.focus();
        return;
    }
    
    // 执行查找
    console.log(`🔍 查找芝麻分为 ${score} 的用户`);
    
    // 从当前参与者中查找匹配的用户
    const matchingUsers = participants.filter(p => p.score === score);
    
    // 显示结果
    displayScoreSearchResults(matchingUsers, score);
    
    // 显示结果容器
    if (resultContainer) {
        resultContainer.style.display = 'block';
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // 给予用户反馈
    if (matchingUsers.length > 0) {
        showToast(`✅ 找到 ${matchingUsers.length} 位芝麻分为 ${score} 的用户`, 'success');
    } else {
        showToast(`⚠️ 未找到芝麻分为 ${score} 的用户`, 'warning');
    }
}

function displayScoreSearchResults(users, targetScore) {
    const resultEl = document.getElementById('scoreSearchResult');
    if (!resultEl) {
        console.error('❌ 未找到分数查找结果显示元素');
        return;
    }
    
    if (users.length === 0) {
        resultEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>未找到匹配用户</h3>
                <p>芝麻分为 ${targetScore} 的用户不存在</p>
                <button class="btn btn-outline" onclick="clearScoreSearch()">
                    ← 清空搜索
                </button>
            </div>
        `;
        return;
    }
    
    // 构建结果HTML
    let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: #e6f7ff; border-radius: 8px;">
            <h4 style="color: #1890ff; margin: 0;">
                🎯 找到 ${users.length} 位芝麻分为 ${targetScore} 的用户
            </h4>
        </div>
        <div class="results-grid" style="display: grid; gap: 12px;">
    `;
    
    // 为每个匹配的用户生成卡片
    users.forEach((user, index) => {
        const isTestUser = user.name?.toUpperCase() === 'TEST';
        const nameStyle = getXiaohongshuIdStyle(user.name);
        const warningIcon = !isValidXiaohongshuId(user.name) ? '⚠️ ' : '';
        
        html += `
            <div class="participant-card" style="
                border-left: 4px solid ${isTestUser ? '#ff4d4f' : '#52c41a'};
                background: ${isTestUser ? '#fff2f0' : '#f6ffed'};
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: transform 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 5px;">
                            ${user.id}
                        </div>
                        <div style="color: #595959; ${nameStyle}">
                            ${warningIcon}${user.name || '未填写'}
                        </div>
                        <div style="font-size: 0.9rem; color: #8c8c8c; margin-top: 5px;">
                            注册时间: ${formatDate(user.created_at)}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.8rem; font-weight: bold; color: ${isTestUser ? '#ff4d4f' : '#52c41a'};">
                            ${user.score}
                        </div>
                        <div style="font-size: 0.9rem; color: #8c8c8c;">芝麻分</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        </div>
        <div style="text-align: center; margin-top: 20px;">
            <button class="btn btn-outline" onclick="clearScoreSearch()">
                ← 清空搜索结果
            </button>
        </div>
    `;
    
    resultEl.innerHTML = html;
}

function clearScoreSearch() {
    const scoreInput = document.getElementById('scoreSearchInput');
    const resultEl = document.getElementById('scoreSearchResult');
    
    if (scoreInput) scoreInput.value = '';
    if (resultEl) {
        resultEl.style.display = 'none';
        resultEl.innerHTML = '';
    }
    
    showToast('已清空搜索结果', 'success');
}

// ==================== 管理后台功能 ====================
function showAdminLogin() {
    if (currentUser?.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        const modal = document.getElementById('adminLoginModal');
        if (modal) modal.style.display = 'flex';
    }
}

function closeAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.style.display = 'none';
}

async function performAdminLogin() {
    const username = document.getElementById('adminUsername')?.value.trim();
    const password = document.getElementById('adminPassword')?.value.trim();
    const errorEl = document.getElementById('adminLoginError');
    
    if (!username || !password) {
        if (errorEl) {
            errorEl.textContent = '请输入用户名和密码';
            errorEl.style.display = 'block';
        }
        return;
    }
    
    // 使用config.js中的凭证
    const adminUsername = typeof DEFAULT_ADMIN !== 'undefined' ? DEFAULT_ADMIN.username : 'admin';
    const adminPassword = typeof DEFAULT_ADMIN !== 'undefined' ? DEFAULT_ADMIN.password : 'admin123';
    
    if (username === adminUsername && password === adminPassword) {
        currentUser = { username: 'admin', role: 'admin' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        closeAdminLoginModal();
        showToast('管理员登录成功！');
        setTimeout(() => window.location.href = 'admin.html', 1000);
    } else {
        if (errorEl) {
            errorEl.textContent = '用户名或密码错误';
            errorEl.style.display = 'block';
        }
    }
}

function showAdminApprovalRequired() {
    alert('⚠️ 需要管理员审核\n\n删除操作需要管理员权限，请前往管理后台进行操作。');
}

// ==================== 模态框关闭 ====================
// 这些函数已经通过bindEventListeners统一绑定，无需再单独绑定